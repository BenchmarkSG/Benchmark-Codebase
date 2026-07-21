/* Stylised, self-contained SVG wordmark/logo chips for Singapore banks.
   These are original simple representations for the prototype (not official assets). */

const wrap = (children) => (
  <svg viewBox="0 0 150 44" width="130" height="38" role="img">{children}</svg>
);

const text = (t, fill, x = 75, size = 20, weight = 800, ls = '0') => (
  <text x={x} y="28" textAnchor="middle" fontFamily="Inter, sans-serif"
    fontWeight={weight} fontSize={size} fill={fill} letterSpacing={ls}>{t}</text>
);

export const BANK_LOGOS = [
  { name: 'DBS', el: wrap(<>{text('DBS', '#e21f26', 55, 24)}<circle cx="112" cy="20" r="9" fill="#e21f26" /></>) },
  { name: 'POSB', el: wrap(text('POSB', '#d6001c', 75, 22)) },
  { name: 'OCBC', el: wrap(<><rect x="20" y="12" width="16" height="16" rx="3" fill="#d81e29" />{text('OCBC', '#1a3763', 88, 20)}</>) },
  { name: 'UOB', el: wrap(<>{text('UOB', '#0b3f8c', 62, 24)}<rect x="104" y="12" width="7" height="16" fill="#0b3f8c" /><rect x="114" y="12" width="7" height="16" fill="#d6001c" /></>) },
  { name: 'Standard Chartered', el: wrap(text('Standard Chartered', '#0473ea', 75, 12.5, 700)) },
  { name: 'Citibank', el: wrap(<>{text('citi', '#004685', 62, 24)}<path d="M96 15 q10 -8 20 0" stroke="#d6001c" strokeWidth="3" fill="none" /></>) },
  { name: 'HSBC', el: wrap(<><path d="M22 12 l10 8 -10 8 -10 -8 z" fill="#db0011" />{text('HSBC', '#1a3763', 90, 20)}</>) },
  { name: 'Maybank', el: wrap(<>{text('Maybank', '#ffc61e', 82, 18)}<path d="M18 26 q6 -12 12 0" fill="#000" /></>) },
  { name: 'Bank of China', el: wrap(text('Bank of China', '#c8102e', 75, 15)) },
  { name: 'CIMB', el: wrap(text('CIMB', '#ec1c24', 75, 22)) },
  { name: 'RHB', el: wrap(<>{text('RHB', '#003da5', 60, 24)}<rect x="102" y="13" width="20" height="14" rx="2" fill="#00a3e0" /></>) },
  { name: 'Trust Bank', el: wrap(text('trust', '#1a1a1a', 75, 22)) },
  { name: 'GXS Bank', el: wrap(text('GXS', '#7b2ff7', 75, 24)) },
  { name: 'MariBank', el: wrap(text('MariBank', '#ff6a3d', 75, 18)) },
  { name: 'State Bank of India', el: wrap(text('SBI', '#22409a', 75, 24)) },
];
