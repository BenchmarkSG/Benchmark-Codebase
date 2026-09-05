// Gold filigree for the individual certificate.
//
// Authored ONCE as an SVG string and consumed two ways: the DOM card uses it as
// a repeating CSS background, and the PNG export draws the same data URI to
// canvas. Hand-drawing scrollwork twice — once in CSS, once in canvas paths —
// would guarantee the shared image drifts from what the user was shown, and
// filigree is far too fiddly to keep matching by eye.

const GOLD = '#d9ae45';
const GOLD_LT = '#efd489';
const ROSE = '#a2506e';

// One symmetric flourish, designed to tile edge-to-edge along a band.
const TILE_W = 120;
const TILE_H = 62;

export const ornamentSvg = (opacity = 1) => `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${TILE_H}" viewBox="0 0 ${TILE_W} ${TILE_H}" opacity="${opacity}">
  <g fill="none" stroke="${GOLD}" stroke-width="2.1" stroke-linecap="round">
    <path d="M60 58C60 41 45 41 45 27C45 15 56 13 60 23C64 13 75 15 75 27C75 41 60 41 60 58"/>
    <path d="M45 27C35 22 24 29 26 41C28 51 40 51 42 41"/>
    <path d="M75 27C85 22 96 29 94 41C92 51 80 51 78 41"/>
    <path d="M0 58C9 46 18 52 16 40"/>
    <path d="M120 58C111 46 102 52 104 40"/>
    <path d="M60 58L60 62"/>
  </g>
  <g fill="${GOLD_LT}">
    <circle cx="60" cy="17" r="3.4"/><circle cx="26" cy="45" r="2.5"/><circle cx="94" cy="45" r="2.5"/>
  </g>
  <g fill="${ROSE}">
    <circle cx="42" cy="45" r="2.1"/><circle cx="78" cy="45" r="2.1"/><circle cx="60" cy="34" r="2.3"/>
  </g>
</svg>`;

// encodeURIComponent (not btoa): the SVG contains non-Latin1-safe characters in
// some builds, and btoa throws on those.
export const ornamentDataUri = (opacity = 1) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ornamentSvg(opacity))}`;

export const ORNAMENT = { width: TILE_W, height: TILE_H, gold: GOLD, goldLight: GOLD_LT, rose: ROSE };
