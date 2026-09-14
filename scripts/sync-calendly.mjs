/* -----------------------------------------------------------------------------
 * FeeOptima — resolve booked Calendly slots into public.leads
 *
 * WHY THIS EXISTS
 * The Calendly inline widget tells the browser a booking happened, but the
 * `calendly.event_scheduled` message carries only opaque URIs — never the start
 * time. The only way to learn the actual slot is Calendly's API, which needs a
 * token. So the browser stores the event URI (record_booking()) and this job
 * turns it into slot_start / slot_end.
 *
 * WHY A SCRIPT AND NOT THE SERVER
 * Writing these columns needs the service role, and the service role must stay
 * off the web runtime. This runs where the other data jobs run: locally, or from
 * GitHub Actions where the key is a repo secret.
 *
 *   npm run sync:calendly          Resolve every booking that has no slot yet.
 *   npm run sync:calendly -- --dry Show what it would write; touch nothing.
 *
 * Needs CALENDLY_TOKEN (a Calendly personal access token), SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY. Without the token it exits 0 with a clear message —
 * a nightly run shouldn't fail red over an integration that isn't set up yet.
 * --------------------------------------------------------------------------- */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const DRY = process.argv.includes('--dry');
const API = 'https://api.calendly.com';

const token = process.env.CALENDLY_TOKEN || '';
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!token) {
  console.log('• CALENDLY_TOKEN not set — skipping slot sync.');
  console.log('  Create one at https://calendly.com/app/admin/integrations/api-webhooks,');
  console.log('  then set it locally in .env and as a repo secret for the nightly run.');
  process.exit(0);
}
if (!url || !key) {
  console.error('✗ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const db = createClient(url, key);

/* Calendly hands back full resource URIs. The GET is the URI itself — no need to
   reassemble it from the uuid, and reassembling would break if the shape ever
   changes. Only accept our own API host, though: the URI reaches us from a
   browser message, so it is not trusted input. */
function safeEventUrl(uri) {
  try {
    const u = new URL(uri);
    if (u.origin !== API) return null;
    if (!/^\/scheduled_events\/[\w-]+$/.test(u.pathname)) return null;
    return u.toString();
  } catch { return null; }
}

async function fetchEvent(uri) {
  const href = safeEventUrl(uri);
  if (!href) return { skip: 'not a Calendly scheduled_events URI' };
  const res = await fetch(href, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return { skip: 'event no longer exists (canceled + purged?)' };
  if (res.status === 401 || res.status === 403) throw new Error('Calendly rejected the token (401/403).');
  if (!res.ok) return { skip: `Calendly returned ${res.status}` };
  const body = await res.json();
  const r = body?.resource;
  if (!r?.start_time) return { skip: 'no start_time in the response' };
  return { start: r.start_time, end: r.end_time || null, status: r.status || null };
}

async function main() {
  // Everything that has been booked but never resolved. A canceled-then-purged
  // event can't be resolved, so `skipped` rows are reported, not retried forever
  // — they simply stay unresolved and show as "time syncing…" in the portal.
  const { data: rows, error } = await db
    .from('leads')
    .select('id, source, advisor_name, email, calendly_event_uri, booked_at')
    .not('calendly_event_uri', 'is', null)
    .is('slot_start', null)
    .order('booked_at', { ascending: false })
    .limit(500);
  if (error) { console.error('✗', error.message); process.exit(1); }

  if (!rows.length) { console.log('✓ Nothing to resolve — every booking already has its slot.'); return; }
  console.log(`Resolving ${rows.length} booking(s)${DRY ? ' (dry run)' : ''}…\n`);

  let done = 0; const skipped = [];
  for (const r of rows) {
    let out;
    try { out = await fetchEvent(r.calendly_event_uri); }
    catch (e) { console.error(`✗ ${e.message}`); process.exit(1); } // bad token: stop, don't hammer
    if (out.skip) { skipped.push(`${r.email || r.id} — ${out.skip}`); continue; }

    const when = new Date(out.start).toISOString().replace('T', ' ').slice(0, 16);
    console.log(`  ${r.source === 'expert' ? 'Option 3' : 'Option 2'}  ${when} UTC  ${r.advisor_name || ''} ${r.email || ''}`.trimEnd());
    if (DRY) { done++; continue; }

    const { error: e } = await db
      .from('leads')
      .update({ slot_start: out.start, slot_end: out.end })
      .eq('id', r.id);
    if (e) skipped.push(`${r.email || r.id} — write failed: ${e.message}`);
    else done++;
  }

  console.log(`\n✓ ${done} slot(s) ${DRY ? 'would be written' : 'written'}.`);
  if (skipped.length) {
    console.log(`• ${skipped.length} left unresolved:`);
    for (const s of skipped) console.log(`   ${s}`);
  }
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
