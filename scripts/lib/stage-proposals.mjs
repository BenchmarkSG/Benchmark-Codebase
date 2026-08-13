// Stage rate updates for human approval instead of writing them live.
//
// Any fetch/scrape script can collect rows and call this — the admin then reviews
// them in the portal (Pending updates) and approves into product_rates. Replaces
// the given source's PENDING batch on each run (idempotent); approved/dismissed
// proposals are never touched.
//
//   import { stageProposals } from './lib/stage-proposals.mjs';
//   await stageProposals(db, 'manual-sg', rows);
//
// Each row: { country_code, product, variant?, bank, currency?, rate_type?,
//             proposed_rate, as_of?, note? }
export async function stageProposals(db, source, items) {
  if (!source) throw new Error('stageProposals: a source name is required');
  const rows = (items || [])
    .filter((i) => i && i.country_code && i.product && i.bank && i.proposed_rate != null && i.proposed_rate !== '')
    .map((i) => ({
      country_code: String(i.country_code).trim(),
      product: String(i.product).trim(),
      variant: i.variant ? String(i.variant).trim() : null,
      bank: String(i.bank).trim(),
      currency: i.currency ? String(i.currency).trim() : null,
      rate_type: i.rate_type ? String(i.rate_type).trim() : null,
      proposed_rate: Number(i.proposed_rate),
      as_of: i.as_of || null,
      note: i.note || null,
      source,
      status: 'pending',
    }))
    .filter((r) => Number.isFinite(r.proposed_rate));

  // Clear this source's stale pending set so re-runs don't pile up duplicates.
  const { error: delErr } = await db.from('rate_proposals').delete().eq('source', source).eq('status', 'pending');
  if (delErr) throw delErr;
  if (!rows.length) return { staged: 0 };

  const { error } = await db.from('rate_proposals').insert(rows);
  if (error) throw error;
  return { staged: rows.length };
}
