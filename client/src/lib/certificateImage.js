// Renders the shareable "certificate" to a PNG File so it can be posted as an
// image via the Web Share API (navigator.share({ files })). Drawn on a canvas —
// fully self-contained (no DOM-to-image library, no external host), pixel-stable
// across browsers, and reliable inside the iOS/Android share sheet.
//
// Keep the copy/design here in sync with Certificate.jsx.

import { SITE_URL } from './site.js';

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
const TAGLINE = { sme: 'Certified Smart Treasury', individual: 'Certified Smart Saver' };

const fontStr = (weight, size) => `${weight} ${size}px ${FONT}`;

// Body copy as rich runs ({ t, b }) — mirrors Certificate.jsx.
function bodyRuns({ product, savingPct }) {
  const service = product || 'banking costs';
  if (savingPct) {
    return [
      { t: 'We saved ' }, { t: `${savingPct}%`, b: true }, { t: ' on our ' }, { t: service, b: true },
      { t: ' by comparing our bank costs with the fee-benchmarking tool at ' },
      { t: 'FeeOptima', b: true }, { t: ' — you could too. Please share widely.' },
    ];
  }
  return [
    { t: 'We compared our ' }, { t: service, b: true },
    { t: ' against the market with the fee-benchmarking tool at ' },
    { t: 'FeeOptima', b: true }, { t: ' — and found real savings. You could too. Please share widely.' },
  ];
}

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

// Build the certificate PNG. Returns a File (or null if unsupported/failed).
export async function buildCertificateImage({ segment = 'individual', product, savingPct } = {}) {
  if (typeof document === 'undefined') return null;
  const site = SITE_URL;
  try { await (document.fonts?.ready ?? Promise.resolve()); } catch { /* fonts optional */ }
  const qr = await makeQr(site).catch(() => null);

  const S = 2;            // supersample for a crisp share image
  const M = 18;           // white margin around the card
  const CARD_W = 600;
  const PAD = 34;
  const contentW = CARD_W - PAD * 2;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const title = TAGLINE[segment] || TAGLINE.individual;
  const HL = { size: 26, lh: 32, reg: 800, bold: 800 };
  const BD = { size: 17, lh: 25, reg: 600, bold: 800 };
  const RL = { size: 17, lh: 24, reg: 800, bold: 800 };

  // Measure pass (measureText is independent of canvas size).
  const hlLines = layout(ctx, toWords([{ t: 'Stop Overpaying Your Bank by Thousands Every Year' }]), contentW, HL.size, HL.reg, HL.bold);
  const bdLines = layout(ctx, toWords(bodyRuns({ product, savingPct })), contentW, BD.size, BD.reg, BD.bold);
  const rlLines = layout(ctx, toWords([{ t: 'Your bank is profiting from you — find out by how much.' }]), contentW, RL.size, RL.reg, RL.bold);

  const RIBBON_H = 34, FOOT_H = 62;
  let y = PAD;
  y += RIBBON_H + 18;
  y += hlLines.length * HL.lh + 12;
  y += bdLines.length * BD.lh + 12;
  y += rlLines.length * RL.lh + 18;
  y += 16;               // dashed divider + gap
  y += FOOT_H;
  const CARD_H = y + PAD;

  // Size + scale.
  canvas.width = (CARD_W + M * 2) * S;
  canvas.height = (CARD_H + M * 2) * S;
  ctx.scale(S, S);

  // Backdrop (white so a dark social timeline doesn't bleed through corners).
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CARD_W + M * 2, CARD_H + M * 2);
  ctx.translate(M, M);

  // Card body + border + inner hairline.
  const grad = ctx.createLinearGradient(0, 0, CARD_W * 0.5, CARD_H);
  grad.addColorStop(0, '#f5f9ff'); grad.addColorStop(0.6, '#ffffff');
  roundRect(ctx, 1, 1, CARD_W - 2, CARD_H - 2, 16);
  ctx.fillStyle = grad; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = C.border; ctx.stroke();
  roundRect(ctx, 6, 6, CARD_W - 12, CARD_H - 12, 11);
  ctx.lineWidth = 1; ctx.strokeStyle = C.inner; ctx.stroke();

  let cy = PAD;

  // Ribbon pill.
  ctx.font = fontStr(800, 15);
  const ribbonText = `🏅 ${title}`;
  const pillW = ctx.measureText(ribbonText).width + 28;
  roundRect(ctx, PAD, cy, pillW, RIBBON_H, RIBBON_H / 2);
  ctx.fillStyle = C.ribbon; ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(ribbonText, PAD + 14, cy + RIBBON_H / 2 + 1);
  cy += RIBBON_H + 18;

  // Headline, body, red call-to-action line.
  cy = drawLines(ctx, hlLines, PAD, cy, HL, C.navy900, C.navy900); cy += 12;
  cy = drawLines(ctx, bdLines, PAD, cy, BD, C.navy700, C.navy900); cy += 12;
  cy = drawLines(ctx, rlLines, PAD, cy, RL, C.red600, C.red600); cy += 18;

  // Dashed divider.
  ctx.strokeStyle = C.divider; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(PAD, cy + 0.5); ctx.lineTo(CARD_W - PAD, cy + 0.5); ctx.stroke();
  ctx.setLineDash([]);
  cy += 16;

  // Footer — brand (left) + QR (right).
  ctx.textBaseline = 'top';
  const brandTop = cy + 8;
  ctx.font = fontStr(800, 18);
  ctx.fillStyle = C.blue600; ctx.fillText('Fee', PAD, brandTop);
  const feeW = ctx.measureText('Fee').width;
  ctx.fillStyle = C.navy900; ctx.fillText('Optima', PAD + feeW, brandTop);
  ctx.font = fontStr(600, 12); ctx.fillStyle = C.muted;
  ctx.fillText('@FeeOptima · feeoptima.com', PAD, brandTop + 24);

  const qrSize = 62, qrX = CARD_W - PAD - qrSize, qrY = cy;
  roundRect(ctx, qrX, qrY, qrSize, qrSize, 8);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = C.line; ctx.stroke();
  if (qr) ctx.drawImage(qr, qrX + 4, qrY + 4, qrSize - 8, qrSize - 8);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return null;
  return new File([blob], 'feeoptima-certificate.png', { type: 'image/png' });
}
