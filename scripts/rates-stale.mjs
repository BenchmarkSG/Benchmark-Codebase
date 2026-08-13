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
    const { data, error } = await db.from(t.table).select(t.select).or(staleFilter);
    if (error) { console.error(`✗ ${t.table}:`, error.message); continue; }
    const rows = (data || []).sort((a, b) => new Date(a.updated_at || 0) - new Date(b.updated_at || 0));
    total += rows.length;
    sections.push({ ...t, rows });
  }

  // Build a Markdown report.
  const lines = [`## 🗓️ Rates due for review — ${total} overdue (not verified in > ${STALE_DAYS} days)`, ''];
  if (!total) {
    lines.push('✅ Everything is current. Nice work.');
  } else {
    for (const s of sections) {
      if (!s.rows.length) continue;
      lines.push(`**${s.title} (${s.rows.length})**`, '');
      for (const r of s.rows) lines.push(`- ${s.label(r)} — _${daysAgo(r.updated_at)}_`);
      lines.push('');
    }
    lines.push('Open the **admin portal**, review each against the source, then click **✓ Verify** (or edit the rate) to clear it.');
  }
  const report = lines.join('\n');

  console.log(report);
  writeFileSync('rates-stale.md', report + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `due_count=${total}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
