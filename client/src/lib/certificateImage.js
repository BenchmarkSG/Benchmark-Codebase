// Renders the shareable "certificate" to a PNG File so it can be posted as an
// image via the Web Share API (navigator.share({ files })). Drawn on a canvas —
// fully self-contained (no DOM-to-image library, no external host), pixel-stable
// across browsers, and reliable inside the iOS/Android share sheet.
//
// Keep the copy/design here in sync with Certificate.jsx.

import { SITE_URL } from './site.js';
import { ornamentDataUri, ORNAMENT } from './certOrnament.js';

const C = {
  border: '#1d63c4',   // blue-600
  ribbon: '#1d63c4',
  inner: '#cfe0f7',
  navy900: '#0b1f3a',
  navy700: '#1a3763',
  blue600: '#1d63c4',
  red600: '#d81e29',
  line: '#e4e9f2',
  muted: '#5b6b82',
  divider: '#c3d2ea',
};
const FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
// Mirrors CorporateCertificate.css — a system serif stack, so the shared PNG
// matches the on-screen document without shipping a web font.
const SERIF = "Georgia, 'Times New Roman', Times, serif";
const GOLD = { mid: '#c9a227', light: '#e6cb74', dark: '#9c7b12', hair: '#ecd9a0' };

const fontStr = (weight, size) => `${weight} ${size}px ${FONT}`;
const serifStr = (weight, size, italic = false) => `${italic ? 'italic ' : ''}${weight} ${size}px ${SERIF}`;

// Split rich runs into words carrying their bold flag (spaces collapse to one).
function toWords(runs) {
  const words = [];
  for (const r of runs) {
    for (const p of r.t.split(/\s+/)) if (p) words.push({ t: p, b: !!r.b });
  }
  return words;
}

// Greedy word-wrap into lines; each word gets an x offset within its line.
function layout(ctx, words, maxW, size, weightReg, weightBold) {
  ctx.font = fontStr(weightReg, size);
  const spaceW = ctx.measureText(' ').width;
  const lines = [];
  let cur = [], x = 0;
  for (const w of words) {
    ctx.font = fontStr(w.b ? weightBold : weightReg, size);
    const ww = ctx.measureText(w.t).width;
    const gap = cur.length ? spaceW : 0;
    if (cur.length && x + gap + ww > maxW) { lines.push(cur); cur = []; x = 0; }
    const g = cur.length ? spaceW : 0;
    x += g;
    cur.push({ ...w, x });
    x += ww;
  }
  if (cur.length) lines.push(cur);
  return lines;
}

function drawLines(ctx, lines, x, y, cfg, colorReg, colorBold) {
  ctx.textBaseline = 'top';
  let cy = y;
  for (const line of lines) {
    for (const w of line) {
      ctx.font = fontStr(w.b ? cfg.bold : cfg.reg, cfg.size);
      ctx.fillStyle = w.b ? colorBold : colorReg;
      ctx.fillText(w.t, x + w.x, cy);
    }
    cy += cfg.lh;
  }
  return cy;
}

// `layout` positions words from the left; centring needs each line's real width,
// which is the last word's offset plus its own measured width.
function lineWidth(ctx, line, cfg) {
  if (!line.length) return 0;
  const last = line[line.length - 1];
  ctx.font = fontStr(last.b ? cfg.bold : cfg.reg, cfg.size);
  return last.x + ctx.measureText(last.t).width;
}

function drawLinesCentered(ctx, lines, cx, y, cfg, colorReg, colorBold) {
  ctx.textBaseline = 'top';
  let cy = y;
  for (const line of lines) {
    const x0 = cx - lineWidth(ctx, line, cfg) / 2;
    for (const w of line) {
      ctx.font = fontStr(w.b ? cfg.bold : cfg.reg, cfg.size);
      ctx.fillStyle = w.b ? colorBold : colorReg;
      ctx.fillText(w.t, x0 + w.x, cy);
    }
    cy += cfg.lh;
  }
  return cy;
}

function centerText(ctx, text, cx, y, font, color) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.fillText(text, cx - ctx.measureText(text).width / 2, y);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function makeQr(site) {
  const mod = await import('qrcode');
  const url = await (mod.default || mod).toDataURL(site, { margin: 0, width: 200, errorCorrectionLevel: 'M' });
  return loadImage(url);
}

// The SME / corporate document, mirroring CorporateCertificate.jsx: gold double
// frame, centred award typography, a ruled holder line, signature blocks and a
// seal. Kept in step with the DOM version by hand — the two are close enough in
// structure that a shared generator would be more indirection than it's worth.
function drawCorporate(ctx, { qr, product, savingPct, company }) {
  const W = 620, PAD = 44;
  const cx = W / 2;
  const contentW = W - PAD * 2;
  const holder = (company || '').trim() || 'Your Company';
  const service = product || 'banking costs';

  const BD = { size: 15, lh: 23, reg: 600, bold: 800 };
  const bodyText = savingPct
    ? [{ t: 'for benchmarking their ' }, { t: service, b: true },
       { t: ' against the market with FeeOptima and identifying ' }, { t: `${savingPct}%`, b: true },
       { t: ' in recoverable annual cost — demonstrating active stewardship of company funds.' }]
    : [{ t: 'for benchmarking their ' }, { t: service, b: true },
       { t: ' against the market with FeeOptima — demonstrating active stewardship of company funds.' }];
  const bdLines = layout(ctx, toWords(bodyText), contentW - 60, BD.size, BD.reg, BD.bold);

  // Height is measured before anything is drawn so the canvas can be sized once.
  let h = PAD;
  h += 40 + 10 + 20 + 22;          // title, subtitle, presented-to
  h += 34 + 16;                    // holder + its rule
  h += bdLines.length * BD.lh + 20;
  h += 20 + 34;                    // date + gap
  h += 46;                         // signature blocks
  h += 20 + 72;                    // divider + footer
  const H = h + PAD - 10;
  return { W, H, draw: () => paintCorporate(ctx, { W, H, PAD, cx, qr, holder, bdLines, BD }) };
}

function paintCorporate(ctx, { W, H, PAD, cx, qr, holder, bdLines, BD }) {
  // Card + gold double frame.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.lineWidth = 2; ctx.strokeStyle = GOLD.mid;
  ctx.strokeRect(1, 1, W - 2, H - 2);
  ctx.lineWidth = 1; ctx.strokeStyle = GOLD.light;
  ctx.strokeRect(8, 8, W - 16, H - 16);

  // Corner accents — two strokes per corner, as in the CSS.
  ctx.fillStyle = GOLD.mid;
  const L = 34, T = 2;
  for (const [x, y, dx, dy] of [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]]) {
    ctx.fillRect(dx > 0 ? x : x - L, dy > 0 ? y : y - T, L, T);
    ctx.fillRect(dx > 0 ? x : x - T, dy > 0 ? y : y - L, T, L);
  }

  let y = PAD;
  centerText(ctx, 'CERTIFICATE', cx, y, serifStr(700, 34), C.navy900);
  y += 40;

  // Subtitle between two short rules.
  const sub = 'OF TREASURY EFFICIENCY';
  ctx.font = fontStr(800, 12);
  const subW = ctx.measureText(sub).width;
  centerText(ctx, sub, cx, y + 2, fontStr(800, 12), GOLD.dark);
  ctx.fillStyle = GOLD.mid;
  ctx.fillRect(cx - subW / 2 - 44, y + 8, 34, 1);
  ctx.fillRect(cx + subW / 2 + 10, y + 8, 34, 1);
  y += 30;

  centerText(ctx, 'THIS CERTIFICATE IS PROUDLY PRESENTED TO', cx, y, fontStr(700, 11), C.muted);
  y += 22;

  centerText(ctx, holder, cx, y, serifStr(700, 30, true), GOLD.dark);
  y += 38;
  ctx.fillStyle = C.navy900;
  ctx.fillRect(cx - 160, y, 320, 1);
  y += 18;

  y = drawLinesCentered(ctx, bdLines, cx, y, BD, C.navy700, C.navy900) + 8;

  const date = (() => {
    try { return new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch { return new Date().toISOString().slice(0, 10); }
  })();
  centerText(ctx, date, cx, y, fontStr(700, 12), C.muted);
  y += 40;

  // Signature blocks.
  const sigW = 170, gap = 46;
  for (const [i, [name, role]] of [['FeeOptima', 'BENCHMARKING AUTHORITY'], [holder, 'AUTHORISED SIGNATORY']].entries()) {
    const sx = cx + (i === 0 ? -sigW - gap / 2 : gap / 2);
    ctx.fillStyle = C.navy900;
    ctx.fillRect(sx, y, sigW, 1);
    centerText(ctx, name, sx + sigW / 2, y + 7, fontStr(800, 12), C.navy900);
    centerText(ctx, role, sx + sigW / 2, y + 23, fontStr(600, 9), C.muted);
  }
  y += 52;

  ctx.fillStyle = GOLD.hair;
  ctx.fillRect(PAD, y, W - PAD * 2, 1);
  y += 16;

  // Footer: seal (left), brand (centre-left), QR (right).
  const sealR = 30, sealCx = PAD + sealR, sealCy = y + sealR;
  const sealGrad = ctx.createRadialGradient(sealCx - 9, sealCy - 10, 3, sealCx, sealCy, sealR);
  sealGrad.addColorStop(0, GOLD.light); sealGrad.addColorStop(0.58, GOLD.mid); sealGrad.addColorStop(1, GOLD.dark);
  ctx.beginPath(); ctx.arc(sealCx, sealCy, sealR, 0, Math.PI * 2);
  ctx.fillStyle = sealGrad; ctx.fill();
  ctx.beginPath(); ctx.arc(sealCx, sealCy, sealR - 7, 0, Math.PI * 2);
  ctx.fillStyle = C.navy900; ctx.fill();
  centerText(ctx, 'CERTIFIED', sealCx, sealCy - 12, fontStr(700, 6.5), GOLD.light);
  centerText(ctx, 'SMART', sealCx, sealCy - 3, fontStr(800, 8), '#ffffff');
  centerText(ctx, 'TREASURY', sealCx, sealCy + 6, fontStr(800, 8), '#ffffff');

  const bx = PAD + sealR * 2 + 16;
  ctx.textBaseline = 'top';
  ctx.font = fontStr(800, 17);
  ctx.fillStyle = C.blue600; ctx.fillText('Fee', bx, y + 12);
  const feeW = ctx.measureText('Fee').width;
  ctx.fillStyle = C.navy900; ctx.fillText('Optima', bx + feeW, y + 12);
  ctx.font = fontStr(600, 11); ctx.fillStyle = C.muted;
  ctx.fillText('@FeeOptima · feeoptima.com', bx, y + 35);

  const qs = 58, qx = W - PAD - qs;
  roundRect(ctx, qx, y + 1, qs, qs, 6);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = C.line; ctx.stroke();
  if (qr) ctx.drawImage(qr, qx + 4, y + 5, qs - 8, qs - 8);
}

// Build the certificate PNG. Returns a File (or null if unsupported/failed).
export async function buildCertificateImage({ segment = 'individual', product, savingPct, company, holderName } = {}) {
  if (typeof document === 'undefined') return null;
  const site = SITE_URL;
  try { await (document.fonts?.ready ?? Promise.resolve()); } catch { /* fonts optional */ }
  const qr = await makeQr(site).catch(() => null);

  // SMEs share the formal document, not the saver card — the PNG has to match
  // what they were just looking at.
  if (segment === 'sme') {
    const S = 2, M = 18;
    const probe = document.createElement('canvas').getContext('2d');
    const { W, H } = drawCorporate(probe, { qr, product, savingPct, company });
    const canvas = document.createElement('canvas');
    canvas.width = (W + M * 2) * S;
    canvas.height = (H + M * 2) * S;
    const cx2 = canvas.getContext('2d');
    cx2.scale(S, S);
    cx2.fillStyle = '#f3f6fb';
    cx2.fillRect(0, 0, W + M * 2, H + M * 2);
    cx2.translate(M, M);
    // Re-measure against the real context so wrapping matches what gets painted.
    const real = drawCorporate(cx2, { qr, product, savingPct, company });
    real.draw();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return null;
    return new File([blob], 'feeoptima-certificate.png', { type: 'image/png' });
  }

  // ---- Individual: the classic award document -----------------------------
  const S = 2;            // supersample for a crisp share image
  const M = 16;
  const W = 600;
  const BAND = 62;                       // filigree band height, matches the CSS
  const FRAME = 14;                      // gold frame thickness
  const PAD = 30;                        // paper padding
  const holder = (holderName || '').trim() || 'A Smart Saver';
  const service = product || 'banking costs';

  const probe = document.createElement('canvas').getContext('2d');
  const BD = { size: 14, lh: 23, reg: 400, bold: 700 };
  const bodyRunsInd = savingPct
    ? [{ t: 'for benchmarking their ' }, { t: service, b: true },
       { t: ' against the market with FeeOptima and uncovering ' }, { t: `${savingPct}%`, b: true },
       { t: ' in recoverable annual cost — proof that the best rate is worth asking for.' }]
    : [{ t: 'for benchmarking their ' }, { t: service, b: true },
       { t: ' against the market with FeeOptima — proof that the best rate is worth asking for.' }];
  const paperW = W - (BAND / 2 + FRAME) * 2;
  const bdLines = layout(probe, toWords(bodyRunsInd), paperW - PAD * 2 - 40, BD.size, BD.reg, BD.bold);

  // Paper height, then the frame and navy field wrap around it.
  let ph = PAD + 6;
  ph += 40 + 20 + 24;                    // title, subtitle, gap
  ph += 36 + 14;                         // holder
  ph += bdLines.length * BD.lh + 24;
  ph += 84;                              // footer row (seal is the tallest item)
  const paperH = ph;
  const H = BAND * 2 + (FRAME + paperH + FRAME) - BAND;   // bands overlap the frame edges

  const canvas = document.createElement('canvas');
  canvas.width = (W + M * 2) * S;
  canvas.height = (H + M * 2) * S;
  const ctx = canvas.getContext('2d');
  ctx.scale(S, S);
  ctx.fillStyle = '#eef2f8';
  ctx.fillRect(0, 0, W + M * 2, H + M * 2);
  ctx.translate(M, M);

  // Navy field.
  const navy = ctx.createLinearGradient(0, 0, 0, H);
  navy.addColorStop(0, '#17255c'); navy.addColorStop(1, '#101a44');
  ctx.fillStyle = navy;
  ctx.fillRect(0, 0, W, H);

  // Filigree bands — the SAME SVG the DOM card uses, tiled across top and
  // bottom (bottom mirrored so the flourishes point inward on both edges).
  const orn = await loadImage(ornamentDataUri()).catch(() => null);
  if (orn) {
    const tw = ORNAMENT.width, th = BAND;
    for (let x = 0; x < W; x += tw) ctx.drawImage(orn, x, 0, tw, th);
    ctx.save();
    ctx.translate(0, H);
    ctx.scale(1, -1);
    for (let x = 0; x < W; x += tw) ctx.drawImage(orn, x, 0, tw, th);
    ctx.restore();
  }

  // Gold frame + white paper.
  const fx = BAND / 2, fy = BAND / 2;
  const fw = W - BAND, fh = H - BAND;
  const gold = ctx.createLinearGradient(fx, fy, fx + fw, fy + fh);
  gold.addColorStop(0, '#f0d78d'); gold.addColorStop(0.38, '#d9ae45');
  gold.addColorStop(0.72, '#a9801f'); gold.addColorStop(1, '#d9ae45');
  ctx.fillStyle = gold;
  ctx.fillRect(fx, fy, fw, fh);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(fx + FRAME, fy + FRAME, fw - FRAME * 2, fh - FRAME * 2);

  const px = fx + FRAME, py = fy + FRAME, pw = fw - FRAME * 2;
  const cx = px + pw / 2;

  // Ribbon banner straddling the paper's top edge.
  ctx.font = fontStr(800, 13);
  const rw = ctx.measureText('FeeOptima').width + 60;
  const rh = 26, rx = cx - rw / 2, ry = py - 13;
  const rg = ctx.createLinearGradient(0, ry, 0, ry + rh);
  rg.addColorStop(0, '#f0d78d'); rg.addColorStop(0.55, '#d9ae45'); rg.addColorStop(1, '#a9801f');
  ctx.beginPath();
  ctx.moveTo(rx, ry); ctx.lineTo(rx + rw, ry);
  ctx.lineTo(rx + rw - 11, ry + rh / 2); ctx.lineTo(rx + rw, ry + rh);
  ctx.lineTo(rx, ry + rh); ctx.lineTo(rx + 11, ry + rh / 2);
  ctx.closePath();
  ctx.fillStyle = rg; ctx.fill();
  centerText(ctx, 'FeeOptima', cx, ry + 6, fontStr(800, 13), '#ffffff');

  let y = py + PAD + 6;
  centerText(ctx, 'CERTIFICATE', cx, y, serifStr(700, 36), '#6d1a24');
  y += 44;
  centerText(ctx, 'Of Achievement', cx, y, serifStr(400, 15, true), C.muted);
  y += 34;
  centerText(ctx, holder, cx, y, serifStr(700, 32, true), '#a9801f');
  y += 46;
  y = drawLinesCentered(ctx, bdLines, cx, y, BD, C.navy700, '#6d1a24') + 20;

  // Footer: date (left), seal (centre), QR (right).
  const sealR = 39, sealCy = y + sealR;
  const sg = ctx.createRadialGradient(cx - 12, sealCy - 13, 4, cx, sealCy, sealR);
  sg.addColorStop(0, '#f0d78d'); sg.addColorStop(0.55, '#d9ae45'); sg.addColorStop(1, '#a9801f');
  ctx.beginPath(); ctx.arc(cx, sealCy, sealR, 0, Math.PI * 2);
  ctx.fillStyle = sg; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, sealCy, sealR - 8, 0, Math.PI * 2);
  ctx.fillStyle = '#17255c'; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = '#f0d78d'; ctx.stroke();
  centerText(ctx, 'CERTIFIED', cx, sealCy - 15, fontStr(700, 7), '#f0d78d');
  centerText(ctx, 'SMART SAVER', cx, sealCy - 4, fontStr(800, 9.5), '#ffffff');
  centerText(ctx, 'feeoptima.com', cx, sealCy + 8, fontStr(600, 6), 'rgba(255,255,255,0.65)');

  const date = (() => {
    try { return new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return new Date().toISOString().slice(0, 10); }
  })();
  const colY = sealCy + sealR - 30;
  const leftCx = px + PAD + 40;
  centerText(ctx, date, leftCx, colY, fontStr(700, 12), C.navy800 || C.navy900);
  ctx.fillStyle = C.navy900; ctx.fillRect(leftCx - 40, colY + 18, 80, 1);
  centerText(ctx, 'DATE', leftCx, colY + 24, fontStr(700, 9), C.muted);

  const qs = 52, qx = px + pw - PAD - qs;
  roundRect(ctx, qx, colY - 8, qs, qs, 4);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = C.line; ctx.stroke();
  if (qr) ctx.drawImage(qr, qx + 3, colY - 5, qs - 6, qs - 6);
  centerText(ctx, 'VERIFY', qx + qs / 2, colY + 48, fontStr(700, 9), C.muted);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return null;
  return new File([blob], 'feeoptima-certificate.png', { type: 'image/png' });
}
