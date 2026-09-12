/* -----------------------------------------------------------------------------
 * FeeOptima — page inspector for adding a scrape-pool.mjs source
 *
 * Renders a page in headless Chromium and prints every table that contains a
 * rate-like number, in full, with the nearest heading above it — so you can
 * see exactly which table belongs to which bank and pick the header pattern,
 * row pattern and column index a source needs. When a page has no such table,
 * the visible text around the first percentage is printed instead, which is how
 * a rate published as prose (or a bot-block page) shows itself.
 *
 *   node scripts/inspect-page.mjs <url> [url ...]
 *   node scripts/inspect-page.mjs --plain <url>     # raw HTML only, no browser
 *
 * Everything scrape-pool.mjs declares was read off this output. Never guess a
 * column from a summary of a page; read the row here and count.
 * --------------------------------------------------------------------------- */
const args = process.argv.slice(2);
const plain = args.includes('--plain');
const urls = args.filter((a) => !a.startsWith('--'));
if (!urls.length) { console.error('usage: node scripts/inspect-page.mjs [--plain] <url> [url ...]'); process.exit(1); }

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

// Runs inside the page: tables with their nearest preceding heading.
const READ_TABLES = (ts) => ts.map((t, i) => {
  const rows = [...t.querySelectorAll('tr')]
    .map((r) => [...r.querySelectorAll('th,td')].map((c) => c.innerText.replace(/\s+/g, ' ').trim()))
    .filter((r) => r.some(Boolean));
  if (!/\d\.\d/.test(rows.map((r) => r.join(' ')).join(' '))) return null;
  let el = t, heading = '';
  outer: for (let depth = 0; depth < 6 && el; depth++) {
    for (let sib = el.previousElementSibling; sib; sib = sib.previousElementSibling) {
      const h = sib.matches('h1,h2,h3,h4,h5,strong,b') ? sib : sib.querySelector('h1,h2,h3,h4,h5');
      if (h && h.innerText.trim()) { heading = h.innerText.replace(/\s+/g, ' ').trim(); break outer; }
    }
    el = el.parentElement;
  }
  return { i, heading, rows };
}).filter(Boolean);

function printTables(url, tables, bodyText) {
  console.log(`\n=== ${url}\n    ${tables.length} rate-bearing table(s)`);
  for (const t of tables) {
    console.log(`--- table ${t.i} (${t.rows.length} rows)${t.heading ? ` · under "${t.heading}"` : ''}`);
    for (const r of t.rows.slice(0, 60)) console.log('    ', JSON.stringify(r.slice(0, 8)));
  }
  if (!tables.length && bodyText) {
    const i = Math.max(0, bodyText.search(/\d\.\d{1,2}\s*%/));
    console.log('    TEXT:', JSON.stringify(bodyText.slice(Math.max(0, i - 500), i + 1200)));
  }
}

if (plain) {
  for (const url of urls) {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    const html = await res.text();
    const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
    const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].map((m, i) => ({
      i, heading: '',
      rows: [...m[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((r) => [...r[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => strip(c[1]))).filter((r) => r.some(Boolean)),
    })).filter((t) => /\d\.\d/.test(t.rows.map((r) => r.join(' ')).join(' ')));
    printTables(`${url}  (HTTP ${res.status}, ${html.length} bytes, no JS)`, tables, strip(html));
  }
} else {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 } });
  for (const url of urls) {
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(1500);
      // Many banks fold the rate table into an accordion; open anything collapsed.
      await page.$$eval('[aria-expanded="false"], summary', (els) => els.slice(0, 40).forEach((e) => { try { e.click(); } catch {} })).catch(() => {});
      await page.waitForTimeout(600);
      const tables = await page.$$eval('table', READ_TABLES);
      const body = await page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n'));
      printTables(url, tables, body);
    } catch (e) {
      console.log(`\n=== ${url}\n    ERROR ${e.message.slice(0, 140)}`);
    } finally { await page.close(); }
  }
  await browser.close();
}
