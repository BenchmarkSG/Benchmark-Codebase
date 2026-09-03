// The certificate's crenellated outline: a row of points along every edge, like
// a seal or a postage stamp. Returns SVG path data.
//
// ONE generator serves both renderers — Certificate.jsx feeds the string to an
// <svg><path>, and certificateImage.js feeds the same string to `new Path2D()`
// for the canvas export. That's deliberate: the two used to be hand-mirrored
// designs that had to be kept in sync by eye, and points on four edges are far
// too fiddly to keep matching that way.
//
// Geometry: an inner "core" rectangle inset by `band` on all sides, with
// triangular points projecting outward from each of its edges to the outer box.
// Point counts are rounded per axis so a whole number spans each edge, which
// keeps the row symmetrical and the points crown-shaped at any card size —
// stretching a fixed count to fit would flatten them into waves instead.
export function crownOutline({ w, h, band = 18, tooth = 30 }) {
  const innerW = w - band * 2;
  const innerH = h - band * 2;
  if (!(innerW > 0) || !(innerH > 0)) return '';

  const nx = Math.max(2, Math.round(innerW / tooth));
  const ny = Math.max(2, Math.round(innerH / tooth));
  const tw = innerW / nx;
  const th = innerH / ny;
  const n = (v) => Math.round(v * 100) / 100;

  // Walk the core rectangle clockwise from its top-left corner, throwing a
  // point outward at the midpoint of every step. Each side ends exactly on the
  // next corner, so the path closes cleanly with square corners between rows.
  const d = [`M${n(band)} ${n(band)}`];
  for (let i = 0; i < nx; i += 1) {                       // top, peaks at y = 0
    d.push(`L${n(band + tw * (i + 0.5))} 0`);
    d.push(`L${n(band + tw * (i + 1))} ${n(band)}`);
  }
  for (let i = 0; i < ny; i += 1) {                       // right, peaks at x = w
    d.push(`L${n(w)} ${n(band + th * (i + 0.5))}`);
    d.push(`L${n(w - band)} ${n(band + th * (i + 1))}`);
  }
  for (let i = 0; i < nx; i += 1) {                       // bottom, peaks at y = h
    d.push(`L${n(w - band - tw * (i + 0.5))} ${n(h)}`);
    d.push(`L${n(w - band - tw * (i + 1))} ${n(h - band)}`);
  }
  for (let i = 0; i < ny; i += 1) {                       // left, peaks at x = 0
    d.push(`L0 ${n(h - band - th * (i + 0.5))}`);
    d.push(`L${n(band)} ${n(h - band - th * (i + 1))}`);
  }
  d.push('Z');
  return d.join('');
}

export const CROWN_BAND = 18;   // how far the points project
export const CROWN_TOOTH = 30;  // target point width; actual is rounded to fit
