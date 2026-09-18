/* -----------------------------------------------------------------------------
 * FeeOptima — fetch bank logos for the reveal screen
 *
 * WHY A SCRIPT
 *   The reveal names whatever bank the rate data names, which reaches further
 *   than the 15-bank carousel each market curates. Those extra banks showed a
 *   name with no mark. This pulls their logos from Wikipedia the same way the
 *   carousel's were pulled, so the set can be rebuilt and audited rather than
 *   collected by hand.
 *
 * HOW A LOGO IS CHOSEN — no guessing at any step
 *   1. ARTICLE. Each bank names its Wikipedia article explicitly below. The
 *      script fetches it and prints the opening line, so a wrong article is
 *      visible in the output rather than silently becoming a wrong logo.
 *   2. FILE. The filename is read from the article's infobox `logo =` field,
 *      never searched for or inferred. No infobox logo ⇒ skipped, loudly.
 *   3. DOWNLOAD. Via Special:FilePath, which redirects to the real file and
 *      renders SVG to PNG for us. It does not go through api.php, which is what
 *      rate-limits.
 *   4. CHECK. The bytes must actually be a PNG/JPEG/GIF/WEBP and over 800B —
 *      an error page saved as .png is still an error page.
 *
 *   PAUSE_MS between requests, because this hit "you are making too many
 *   requests" the last time it was run in a hurry.
 *
 *   node scripts/fetch-bank-logos.mjs            download the missing ones
 *   node scripts/fetch-bank-logos.mjs --dry      resolve + report, write nothing
 *   node scripts/fetch-bank-logos.mjs --force    re-download even if present
 *
 * LICENSING IS NOT SETTLED BY THIS SCRIPT. Wikipedia hosts many bank logos
 * under fair use, which does not cover commercial reuse. Every file it writes
 * is listed at the end with its source page so the set can be reviewed before
 * launch. See DATA_GAPS.md.
 * --------------------------------------------------------------------------- */
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';

const OUT_DIR = 'client/public/images/bankLogos';
const UA = 'FeeOptima-logo-fetch/1.0 (contact: hello@feeoptima.com)';
const PAUSE_MS = 2500;
const WIDTH = 320;

const DRY = process.argv.includes('--dry');
const FORCE = process.argv.includes('--force');

/* bank-as-named-in-the-rate-data → { slug, article, file }
   `slug` is the key added to the B registry in BankLogos.jsx.
   `article` is the exact en.wikipedia title. */
const WANTED = [
  // ---- India ----
  { cc: 'IN', slug: 'canara',      name: 'Canara Bank',            article: 'Canara Bank' },
  { cc: 'IN', slug: 'centralBank', name: 'Central Bank of India',  article: 'Central Bank of India' },
  { cc: 'IN', slug: 'idfcFirst',   name: 'IDFC First Bank',        article: 'IDFC First Bank' },
  { cc: 'IN', slug: 'indianBank',  name: 'Indian Bank',            article: 'Indian Bank' },
  { cc: 'IN', slug: 'indusind',    name: 'IndusInd Bank',          article: 'IndusInd Bank' },
  { cc: 'IN', slug: 'unionBank',   name: 'Union Bank of India',    article: 'Union Bank of India' },

  // ---- Malaysia ----
  { cc: 'MY', slug: 'alRajhi',     name: 'Al Rajhi Bank',          article: 'Al Rajhi Bank' },
  { cc: 'MY', slug: 'alliance',    name: 'Alliance Bank',          article: 'Alliance Bank Malaysia' },
  { cc: 'MY', slug: 'muamalat',    name: 'Bank Muamalat Malaysia', article: 'Bank Muamalat Malaysia' },
  { cc: 'MY', slug: 'bankRakyat',  name: 'Bank Rakyat',            article: 'Bank Rakyat' },
  { cc: 'MY', slug: 'bsn',         name: 'Bank Simpanan Nasional', article: 'Bank Simpanan Nasional' },
  { cc: 'MY', slug: 'kfh',         name: 'Kuwait Finance House',   article: 'Kuwait Finance House' },
  { cc: 'MY', slug: 'mbsb',        name: 'MBSB Bank',              article: 'MBSB Bank' },

  // ---- Singapore ----
  // GXS and Trust already have artwork in the folder (GxsBank.png, trustBank.png)
  // from an earlier pass — they were never wired into the registry, which is why
  // they read as missing. Nothing to fetch; see BankLogos.jsx.
  // Hong Leong Finance (SG) has no article of its own. It is a separate listed
  // company from Hong Leong Bank (MY), so the Hong Leong Group mark would be a
  // different institution's — left without a logo deliberately.

  // ---- Thailand ----
  { cc: 'TH', slug: 'megaIcbc',    name: 'Mega International Commercial Bank', article: 'Mega International Commercial Bank' },
  { cc: 'TH', slug: 'smtb',        name: 'Sumitomo Mitsui Trust Bank',        article: 'Sumitomo Mitsui Trust Bank' },
  { cc: 'TH', slug: 'tisco',       name: 'TISCO Bank',             article: 'Tisco Bank' },
  { cc: 'TH', slug: 'thaiCredit',  name: 'Thai Credit Bank',       article: 'Thai Credit Bank' },
  // No source, deliberately left out rather than mapped to a lookalike:
  //   CLICX Bank (TH)            a 2025 virtual-bank licensee, no article yet
  //   Thai Credit Bank (TH)      no article
  //   MBSB Bank (MY)             no article
  //   Bank Muamalat Malaysia     article exists but carries no infobox logo
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = (params) => `https://en.wikipedia.org/w/api.php?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* The infobox `logo =` field, exactly as written. Handles the three forms banks
   actually use: a bare filename, [[File:X|...]], and {{...|image=X}}. */
function logoFileFrom(wikitext) {
  const patterns = [
    /\|\s*logo\s*=\s*\[\[\s*(?:File|Image):\s*([^|\]]+)/i,
    /\|\s*logo\s*=\s*\{\{[^}]*?\|\s*(?:image|file)\s*=\s*([^|}]+)/i,
    /\|\s*logo\s*=\s*([^\n|{[]+\.(?:svg|png|jpg|jpeg|gif|webp))/i,
    /\|\s*image\s*=\s*\[\[\s*(?:File|Image):\s*([^|\]]+)/i,
  ];
  for (const re of patterns) {
    const m = wikitext.match(re);
    if (m) return m[1].trim().replace(/_/g, ' ');
  }
  return null;
}

const MAGIC = [
  { ext: 'png',  bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: 'jpg',  bytes: [0xff, 0xd8, 0xff] },
  { ext: 'gif',  bytes: [0x47, 0x49, 0x46, 0x38] },
];
const sniff = (buf) => {
  for (const m of MAGIC) if (m.bytes.every((b, i) => buf[i] === b)) return m.ext;
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
};

mkdirSync(OUT_DIR, { recursive: true });
const done = [], failed = [];

for (const w of WANTED) {
  const target = `${OUT_DIR}/${w.slug}.png`;
  if (!FORCE && existsSync(target)) { console.log(`  · ${w.name} — already have ${w.slug}.png`); continue; }
  try {
    // 1) the article, and its opening line for eyeballing
    const page = await getJson(api({ action: 'query', prop: 'extracts|revisions', rvprop: 'content', rvslots: 'main', exintro: '1', explaintext: '1', titles: w.article, redirects: '1' }));
    const p = page?.query?.pages?.[0];
    if (!p || p.missing) throw new Error(`no article "${w.article}"`);
    const intro = String(p.extract || '').split('\n')[0].slice(0, 130);
    const wikitext = p?.revisions?.[0]?.slots?.main?.content || '';

    // 2) the filename, from the infobox only
    const file = logoFileFrom(wikitext);
    if (!file) throw new Error(`article "${p.title}" has no infobox logo field`);

    console.log(`  → ${w.cc} ${w.name}`);
    console.log(`      article : ${p.title} — ${intro}`);
    console.log(`      logo    : ${file}`);
    if (DRY) { done.push({ ...w, title: p.title, file, wrote: null }); await sleep(PAUSE_MS); continue; }

    // 3) download through Special:FilePath (renders SVG → PNG, skips api.php)
    const url = `https://en.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${WIDTH}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    if (!res.ok) throw new Error(`file HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());

    // 4) it has to actually be an image
    const kind = sniff(buf);
    if (!kind) throw new Error(`downloaded ${buf.length}B that is not an image (an error page?)`);
    if (buf.length < 800) throw new Error(`only ${buf.length}B — too small to be a logo`);

    const out = `${OUT_DIR}/${w.slug}.${kind}`;
    writeFileSync(out, buf);
    console.log(`      saved   : ${out} (${kind}, ${(buf.length / 1024).toFixed(1)}KB)`);
    done.push({ ...w, title: p.title, file, wrote: `${w.slug}.${kind}` });
  } catch (e) {
    console.error(`  ✗ ${w.cc} ${w.name}: ${e.message}`);
    failed.push({ ...w, why: e.message });
  }
  await sleep(PAUSE_MS);
}

console.log(`\n${done.length} resolved, ${failed.length} failed.`);
if (done.length) {
  console.log('\nRegistry lines for client/src/components/BankLogos.jsx:');
  for (const d of done.filter((x) => x.wrote)) {
    console.log(`  ${d.slug}: { img: '${d.wrote}', el: wrap(text('${d.name}', '#333', 75, 15)) },`);
  }
  console.log('\nProvenance — review before launch (Wikipedia hosts many of these under fair use):');
  for (const d of done) console.log(`  ${d.cc} ${d.name}  ←  ${d.title}  ←  File:${d.file}`);
}
if (failed.length) {
  console.log('\nNo logo written for:');
  for (const f of failed) console.log(`  ${f.cc} ${f.name} — ${f.why}`);
}
