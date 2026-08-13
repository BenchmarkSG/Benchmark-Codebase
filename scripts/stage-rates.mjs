// Example fetcher: stage per-bank rates from a CSV into rate_proposals for review.
//
// This is the template for the "fetch → approve" pattern: a scraper for a source
// with no clean API collects rows however it can, then calls stageProposals().
// Here the "fetch" is just a CSV a human/VA collected — swap parseCsv() for your
// scrape and keep the staging call.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
//     node scripts/stage-rates.mjs scripts/stage-rates.sample.csv --source=manual-sg
//
// CSV header: country_code,product,variant,bank,currency,rate,rate_type,as_of,note
// (Keep values comma-free — this is a deliberately simple parser.)
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { stageProposals } from './lib/stage-proposals.mjs';

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
  if (!lines.length) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h] = (cells[i] ?? '').trim(); });
    return row;
  });
}

async function main() {
  const file = process.argv[2];
  const sourceArg = process.argv.find((a) => a.startsWith('--source='));
  const source = sourceArg ? sourceArg.split('=')[1] : 'manual-import';
  if (!file) {
    console.error('Usage: node scripts/stage-rates.mjs <file.csv> [--source=name]');
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('✗ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
  const db = createClient(url, key);

  const rows = parseCsv(readFileSync(file, 'utf8')).map((r) => ({
    country_code: r.country_code, product: r.product, variant: r.variant,
    bank: r.bank, currency: r.currency, rate_type: r.rate_type,
    proposed_rate: r.rate, as_of: r.as_of || null, note: r.note || null,
  }));

  const { staged } = await stageProposals(db, source, rows);
  console.log(`✓ Staged ${staged} proposal(s) from ${file} under source "${source}".`);
  console.log('  Review them in the admin portal → Pending updates.');
}

main().catch((e) => { console.error(e); process.exit(1); });
