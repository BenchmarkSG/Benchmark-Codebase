// Daily "rates due for review" report.
//
// Lists the manually-maintained rate rows that haven't been edited or verified in
// > STALE_DAYS (default 30). Bot-fed rows (pool:th / pool:my / market:fetch) keep a
// fresh updated_at, so they fall off this list automatically — what's left is the
// hand-kept data that actually needs a human to re-check.
//
// Run:  SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run rates:stale
// In CI it writes a Markdown report to the job summary + rates-stale.md, and the
// `due_count` output drives whether the workflow opens a review issue. Exit 0
// always (a reminder must never fail the pipeline).
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, appendFileSync } from 'node:fs';

const STALE_DAYS = Number(process.env.STALE_DAYS || 30);
// GitHub rejects an issue body over 65,536 characters, and this reminder died
// silently for two days when the backlog crossed it (1,178 rows => 77 kB). The
// report is now bounded by construction: an exact count straight from Postgres,
// but only the most overdue MAX_LIST rows spelled out per section. A 1,200-item
// bullet list was never actionable anyway — the work happens in the admin portal.
const MAX_LIST = Number(process.env.MAX_LIST || 40);
const BODY_LIMIT = 60000;
const cutoff = new Date(Date.now() - STALE_DAYS * 86400000).toISOString();
const staleFilter = `updated_at.is.null,updated_at.lt.${cutoff}`;

// The three hand-maintained tables + how to label a stale row in the report.
const TABLES = [
  { table: 'product_rates', select: 'id, country_code, product, variant, bank, currency, updated_at',
    label: (r) => `${r.country_code} · ${r.product}${r.variant ? ` (${r.variant})` : ''} · ${r.bank || '—'}${r.currency ? ` · ${r.currency}` : ''}`,
    title: 'Product rates' },
  { table: 'remittance_charges', select: 'id, direction, counterparty, updated_at, banks!inner(name, country_code)',
    label: (r) => `${r.banks?.country_code || '—'} · ${r.banks?.name || '—'} · ${r.direction || ''} ${r.counterparty || ''}`.trim(),
    title: 'Remittance charges' },
  { table: 'negotiation_thresholds', select: 'id, country_code, product, updated_at',
    label: (r) => `${r.country_code} · ${r.product}`,
    title: 'Negotiation thresholds' },
];

const daysAgo = (ts) => (ts ? `${Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)}d ago` : 'never verified');

async function main() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('✗ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  const db = createClient(url, key);

  const sections = [];
  let total = 0;
  for (const t of TABLES) {
    // Count and sample are separate queries on purpose. A plain select is capped
    // at PostgREST's 1,000-row ceiling, so a 1,245-row backlog used to report
    // itself as exactly 1,000 — wrong, and wrong in the quiet direction.
    // head: true returns the number with no rows at all.
    const { count, error: countErr } = await db.from(t.table)
      .select(t.select, { count: 'exact', head: true }).or(staleFilter);
    if (countErr) { console.error(`✗ ${t.table}:`, countErr.message); continue; }

    // Oldest first, so the sample we do print is the most overdue. Sorting in
    // SQL rather than JS is what makes the LIMIT meaningful.
    const { data, error } = await db.from(t.table).select(t.select).or(staleFilter)
      .order('updated_at', { ascending: true, nullsFirst: true }).limit(MAX_LIST);
    if (error) { console.error(`✗ ${t.table}:`, error.message); continue; }

    total += count || 0;
    sections.push({ ...t, rows: data || [], count: count || 0 });
  }

  // Build a Markdown report.
  const lines = [`## 🗓️ Rates due for review — ${total} overdue (not verified in > ${STALE_DAYS} days)`, ''];
  if (!total) {
    lines.push('✅ Everything is current. Nice work.');
  } else {
    for (const s of sections) {
      if (!s.count) continue;
      lines.push(`**${s.title} (${s.count})**`, '');
      for (const r of s.rows) lines.push(`- ${s.label(r)} — _${daysAgo(r.updated_at)}_`);
      const hidden = s.count - s.rows.length;
      if (hidden > 0) lines.push(`- _…and ${hidden} more — the ${s.rows.length} most overdue are listed above._`);
      lines.push('');
    }
    lines.push('Open the **admin portal**, review each against the source, then click **✓ Verify** (or edit the rate) to clear it.');
  }
  // Last line of defence: even a future change to MAX_LIST can't take the daily
  // reminder down again.
  let report = lines.join('\n');
  if (report.length > BODY_LIMIT) {
    report = `${report.slice(0, BODY_LIMIT)}\n\n_…report truncated._`;
  }

  console.log(report);
  writeFileSync('rates-stale.md', report + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `due_count=${total}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
