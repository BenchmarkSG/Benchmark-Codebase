/* Bank logo data for the partner carousel.
   `img` points to a real logo file in public/images/bankLogos; `el` is a
   self-contained SVG wordmark kept as a silent fallback if the image fails.
   The SVGs are original simple representations for the prototype (not official assets). */

const wrap = (children) => (
  <svg viewBox="0 0 150 44" width="130" height="38" role="img">{children}</svg>
);

const text = (t, fill, x = 75, size = 20, weight = 800, ls = '0') => (
  <text x={x} y="28" textAnchor="middle" fontFamily="Inter, sans-serif"
    fontWeight={weight} fontSize={size} fill={fill} letterSpacing={ls}>{t}</text>
);

const LOGO_DIR = '/images/bankLogos';

export const BANK_LOGOS = [
  { name: 'DBS', img: `${LOGO_DIR}/dbsBank.png`, el: wrap(<>{text('DBS', '#e21f26', 55, 24)}<circle cx="112" cy="20" r="9" fill="#e21f26" /></>) },
  { name: 'POSB', img: `${LOGO_DIR}/POSBbank.png`, el: wrap(text('POSB', '#d6001c', 75, 22)) },
  { name: 'OCBC', img: `${LOGO_DIR}/OCBCBank.png`, el: wrap(<><rect x="20" y="12" width="16" height="16" rx="3" fill="#d81e29" />{text('OCBC', '#1a3763', 88, 20)}</>) },
  { name: 'UOB', img: `${LOGO_DIR}/UobBank.png`, el: wrap(<>{text('UOB', '#0b3f8c', 62, 24)}<rect x="104" y="12" width="7" height="16" fill="#0b3f8c" /><rect x="114" y="12" width="7" height="16" fill="#d6001c" /></>) },
  { name: 'Standard Chartered', img: `${LOGO_DIR}/standardChartered.png`, el: wrap(text('Standard Chartered', '#0473ea', 75, 12.5, 700)) },
  { name: 'Citibank', img: `${LOGO_DIR}/Citi.png`, el: wrap(<>{text('citi', '#004685', 62, 24)}<path d="M96 15 q10 -8 20 0" stroke="#d6001c" strokeWidth="3" fill="none" /></>) },
  { name: 'HSBC', img: `${LOGO_DIR}/HSBC-Logo.png`, el: wrap(<><path d="M22 12 l10 8 -10 8 -10 -8 z" fill="#db0011" />{text('HSBC', '#1a3763', 90, 20)}</>) },
  { name: 'Maybank', img: `${LOGO_DIR}/logo-bank-maybank copy.jpg`, el: wrap(<>{text('Maybank', '#ffc61e', 82, 18)}<path d="M18 26 q6 -12 12 0" fill="#000" /></>) },
  { name: 'Bank of China', img: `${LOGO_DIR}/Bank-of-China-logo.png`, el: wrap(text('Bank of China', '#c8102e', 75, 15)) },
  { name: 'CIMB', img: `${LOGO_DIR}/CIMB-Logo.png`, el: wrap(text('CIMB', '#ec1c24', 75, 22)) },
  { name: 'RHB', img: `${LOGO_DIR}/RHB_Logo.svg.webp`, el: wrap(<>{text('RHB', '#003da5', 60, 24)}<rect x="102" y="13" width="20" height="14" rx="2" fill="#00a3e0" /></>) },
  { name: 'Trust Bank', img: `${LOGO_DIR}/trustBank.png`, el: wrap(text('trust', '#1a1a1a', 75, 22)) },
  { name: 'GXS Bank', img: `${LOGO_DIR}/GxsBank.png`, el: wrap(text('GXS', '#7b2ff7', 75, 24)) },
  { name: 'MariBank', img: `${LOGO_DIR}/MariBank.png`, el: wrap(text('MariBank', '#ff6a3d', 75, 18)) },
  { name: 'State Bank of India', img: `${LOGO_DIR}/SBI-Logo.jpg`, el: wrap(text('SBI', '#22409a', 75, 24)) },
  { name: 'Revolut', img: `${LOGO_DIR}/Revolut-Logo.jpg`, el: wrap(text('Revolut', '#191c1f', 75, 22)) },
  { name: 'Aspire', img: `${LOGO_DIR}/aspireBank.webp`, el: wrap(text('Aspire', '#1a56db', 75, 22)) },
];

// Text-wordmark entry — a clean, consistent representation for markets/banks we
// don't ship an image logo for (prototype only, not an official asset).
const tw = (name, str, fill, size = 20) => ({ name, img: null, el: wrap(text(str, fill, 75, size)) });

// India
const IN_LOGOS = [
  { name: 'State Bank of India', img: `${LOGO_DIR}/SBI-Logo.jpg`, el: wrap(text('SBI', '#22409a', 75, 24)) },
  tw('HDFC Bank', 'HDFC', '#004c8f', 22),
  tw('ICICI Bank', 'ICICI', '#ae282e', 22),
  tw('Axis Bank', 'AXIS', '#97144d', 22),
  tw('Kotak Mahindra', 'Kotak', '#003874', 21),
  tw('Punjab National Bank', 'PNB', '#4b2e83', 24),
  tw('Bank of Baroda', 'Baroda', '#f37021', 20),
  tw('Yes Bank', 'YES BANK', '#00518f', 17),
];

// Malaysia
const MY_LOGOS = [
  { name: 'Maybank', img: `${LOGO_DIR}/logo-bank-maybank copy.jpg`, el: wrap(<>{text('Maybank', '#ffc61e', 82, 18)}<path d="M18 26 q6 -12 12 0" fill="#000" /></>) },
  { name: 'CIMB', img: `${LOGO_DIR}/CIMB-Logo.png`, el: wrap(text('CIMB', '#ec1c24', 75, 22)) },
  { name: 'RHB', img: `${LOGO_DIR}/RHB_Logo.svg.webp`, el: wrap(<>{text('RHB', '#003da5', 60, 24)}<rect x="102" y="13" width="20" height="14" rx="2" fill="#00a3e0" /></>) },
  tw('Public Bank', 'Public Bank', '#cc0000', 16),
  tw('Hong Leong Bank', 'Hong Leong', '#00539b', 18),
  tw('AmBank', 'AmBank', '#ed1c24', 22),
  { name: 'Standard Chartered', img: `${LOGO_DIR}/standardChartered.png`, el: wrap(text('Standard Chartered', '#0473ea', 75, 12.5, 700)) },
];

// Indonesia
const ID_LOGOS = [
  tw('Bank Central Asia', 'BCA', '#0060af', 24),
  tw('Bank Mandiri', 'Mandiri', '#003d79', 20),
  tw('Bank Negara Indonesia', 'BNI', '#f15a22', 24),
  tw('Bank Rakyat Indonesia', 'BRI', '#00529c', 24),
  tw('CIMB Niaga', 'CIMB Niaga', '#ec1c24', 16),
  { name: 'HSBC', img: `${LOGO_DIR}/HSBC-Logo.png`, el: wrap(<><path d="M22 12 l10 8 -10 8 -10 -8 z" fill="#db0011" />{text('HSBC', '#1a3763', 90, 20)}</>) },
];

// Thailand
const TH_LOGOS = [
  tw('Bangkok Bank', 'Bangkok Bank', '#1e4598', 15),
  tw('Kasikornbank', 'KBank', '#138f2d', 22),
  tw('Siam Commercial Bank', 'SCB', '#4e2e7f', 24),
  tw('Krungthai Bank', 'Krungthai', '#01b0e6', 19),
  tw('Bank of Ayudhya', 'Krungsri', '#e8a200', 19),
  { name: 'Citibank', img: `${LOGO_DIR}/Citi.png`, el: wrap(<>{text('citi', '#004685', 62, 24)}<path d="M96 15 q10 -8 20 0" stroke="#d6001c" strokeWidth="3" fill="none" /></>) },
];

// Per-market logo sets for the "Banks & Companies We Track" marquee. Defaults to
// the Singapore set for any market we don't have a curated list for.
export const MARKET_LOGOS = { SG: BANK_LOGOS, IN: IN_LOGOS, MY: MY_LOGOS, ID: ID_LOGOS, TH: TH_LOGOS };
export const logosForMarket = (code) => MARKET_LOGOS[String(code || 'SG').toUpperCase()] || BANK_LOGOS;
