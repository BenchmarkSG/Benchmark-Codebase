import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const bad = [];
p.on('response', (r) => { if (r.url().includes('/images/bankLogos/') && r.status() >= 400) bad.push(`${r.status()} ${decodeURIComponent(r.url().split('/').pop())}`); });
await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
for (const [code, label] of [['IN','India'],['MY','Malaysia'],['ID','Indonesia'],['TH','Thailand']]) {
  await p.selectOption('.nav__pick--country select', code).catch(() => {});
  await p.waitForTimeout(900);
  const el = await p.$('#partners');
  if (el) { await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(500); }
  const stats = await p.evaluate(() => {
    const items = [...document.querySelectorAll('.marquee__item')];
    const imgs = items.map((i) => i.querySelector('img'));
    return {
      items: items.length / 2,
      realImages: imgs.filter(Boolean).length / 2,
      broken: imgs.filter((i) => i && i.naturalWidth === 0).length / 2,
      fallbackSvgs: items.filter((i) => !i.querySelector('img')).length / 2,
    };
  });
  console.log(label.padEnd(10), JSON.stringify(stats));
  if (el) await el.screenshot({ path: `/tmp/claude-501/-Users-dhruvanshkumar-Documents-benchmarksg/d524f563-fd2a-4637-9ce4-9063cb4976de/scratchpad/logos/car-${code}.png` });
}
console.log('failed requests:', bad.length ? bad : 'none');
await b.close();
