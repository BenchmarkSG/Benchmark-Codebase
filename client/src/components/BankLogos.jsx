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

/* One entry per institution, keyed by slug. Several banks are tracked in more
   than one market (MUFG and BNP Paribas in all five), so keeping the artwork
   here rather than in each market array means one logo, defined once. */
const B = {
  dbs:          { img: 'dbsBank.png',                  el: wrap(<>{text('DBS', '#e21f26', 55, 24)}<circle cx="112" cy="20" r="9" fill="#e21f26" /></>) },
  posb:         { img: 'POSBbank.png',                 el: wrap(text('POSB', '#d6001c', 75, 22)) },
  ocbc:         { img: 'OCBCBank.png',                 el: wrap(<><rect x="20" y="12" width="16" height="16" rx="3" fill="#d81e29" />{text('OCBC', '#1a3763', 88, 20)}</>) },
  uob:          { img: 'UobBank.png',                  el: wrap(<>{text('UOB', '#0b3f8c', 62, 24)}<rect x="104" y="12" width="7" height="16" fill="#0b3f8c" /><rect x="114" y="12" width="7" height="16" fill="#d6001c" /></>) },
  stanchart:    { img: 'standardChartered.png',        el: wrap(text('Standard Chartered', '#0473ea', 75, 12.5, 700)) },
  citi:         { img: 'Citi.png',                     el: wrap(<>{text('citi', '#004685', 62, 24)}<path d="M96 15 q10 -8 20 0" stroke="#d6001c" strokeWidth="3" fill="none" /></>) },
  hsbc:         { img: 'HSBC-Logo.png',                el: wrap(<><path d="M22 12 l10 8 -10 8 -10 -8 z" fill="#db0011" />{text('HSBC', '#1a3763', 90, 20)}</>) },
  maybank:      { img: 'logo-bank-maybank copy.jpg',   el: wrap(<>{text('Maybank', '#ffc61e', 82, 18)}<path d="M18 26 q6 -12 12 0" fill="#000" /></>) },
  bankOfChina:  { img: 'Bank-of-China-logo.png',       el: wrap(text('Bank of China', '#c8102e', 75, 15)) },
  cimb:         { img: 'CIMB-Logo.png',                el: wrap(text('CIMB', '#ec1c24', 75, 22)) },
  rhb:          { img: 'RHB_Logo.svg.webp',            el: wrap(<>{text('RHB', '#003da5', 60, 24)}<rect x="102" y="13" width="20" height="14" rx="2" fill="#00a3e0" /></>) },
  mufg:         { img: 'mufgBank.png',                 el: wrap(text('MUFG', '#e60012', 75, 22)) },
  mizuho:       { img: 'mizuho.png',                   el: wrap(text('MIZUHO', '#1d2f8f', 75, 20)) },
  sbi:          { img: 'SBI-Logo.jpg',                 el: wrap(text('SBI', '#22409a', 75, 24)) },
  bnp:          { img: 'bnpParibas.png',               el: wrap(text('BNP Paribas', '#00915a', 75, 16)) },

  hdfc:         { img: 'hdfcBank.png',                 el: wrap(text('HDFC', '#004c8f', 75, 22)) },
  icici:        { img: 'iciciBank.png',                el: wrap(text('ICICI', '#ae282e', 75, 22)) },
  axis:         { img: 'axisBank.png',                 el: wrap(text('AXIS', '#97144d', 75, 22)) },
  kotak:        { img: 'kotakMahindra.png',            el: wrap(text('Kotak', '#003874', 75, 21)) },
  pnb:          { img: 'punjabNationalBank.png',       el: wrap(text('PNB', '#4b2e83', 75, 24)) },
  baroda:       { img: 'bankOfBaroda.png',             el: wrap(text('Baroda', '#f37021', 75, 20)) },
  yes:          { img: 'yesBank.png',                  el: wrap(text('YES BANK', '#00518f', 75, 17)) },
  deutsche:     { img: 'deutscheBank.png',             el: wrap(text('Deutsche Bank', '#0018a8', 75, 14)) },

  publicBank:   { img: 'publicBank.png',               el: wrap(text('Public Bank', '#cc0000', 75, 16)) },
  hongLeong:    { img: 'hongLeongBank.png',            el: wrap(text('Hong Leong', '#00539b', 75, 18)) },
  ambank:       { img: 'ambank.png',                   el: wrap(text('AmBank', '#ed1c24', 75, 22)) },
  bankIslam:    { img: 'bankIslam.jpg',                el: wrap(text('Bank Islam', '#b01e3c', 75, 18)) },
  affin:        { img: 'affinBank.png',                el: wrap(text('AFFIN BANK', '#1c8ecd', 75, 16)) },

  bca:          { img: 'bankCentralAsia.png',          el: wrap(text('BCA', '#0060af', 75, 24)) },
  mandiri:      { img: 'bankMandiri.png',              el: wrap(text('Mandiri', '#003d79', 75, 20)) },
  bni:          { img: 'bankNegaraIndonesia.png',      el: wrap(text('BNI', '#f15a22', 75, 24)) },
  bri:          { img: 'bankRakyatIndonesia.png',      el: wrap(text('BRI', '#00529c', 75, 24)) },
  cimbNiaga:    { img: 'cimbNiaga.png',                el: wrap(text('CIMB Niaga', '#ec1c24', 75, 16)) },
  danamon:      { img: 'bankDanamon.png',              el: wrap(text('Danamon', '#007a33', 75, 19)) },
  permata:      { img: 'permataBank.png',              el: wrap(text('PermataBank', '#4d4d4f', 75, 15)) },
  panin:        { img: 'paninBank.png',                el: wrap(text('PaninBank', '#ed1c24', 75, 17)) },

  bangkokBank:  { img: 'bangkokBank.png',              el: wrap(text('Bangkok Bank', '#1e4598', 75, 15)) },
  kasikorn:     { img: 'kasikornbank.png',             el: wrap(text('KBank', '#138f2d', 75, 22)) },
  scb:          { img: 'siamCommercialBank.png',       el: wrap(text('SCB', '#4e2e7f', 75, 24)) },
  krungthai:    { img: 'krungthaiBank.png',            el: wrap(text('Krungthai', '#01b0e6', 75, 19)) },
  ayudhya:      { img: 'bankOfAyudhya.png',            el: wrap(text('Krungsri', '#e8a200', 75, 19)) },
  ttb:          { img: 'tmbThanachart.png',            el: wrap(text('ttb', '#1279be', 75, 24)) },
  kkp:          { img: 'kiatnakinPhatra.png',          el: wrap(text('KKP', '#4b2e6f', 75, 24)) },
  lhb:          { img: 'lhBank.png',                   el: wrap(text('LHB', '#939598', 75, 24)) },
  icbc:         { img: 'icbc.png',                     el: wrap(text('ICBC', '#c7000b', 75, 24)) },

  /* Banks that appear in the RATE DATA but not in any market's 15-bank carousel.
     Fetched by scripts/fetch-bank-logos.mjs; used only by logoForBank below. */
  canara:       { img: 'canara.png',                   el: wrap(text('Canara Bank', '#1a5fa8', 75, 15)) },
  centralBank:  { img: 'centralBank.png',              el: wrap(text('Central Bank of India', '#12377e', 75, 12)) },
  idfcFirst:    { img: 'idfcFirst.png',                el: wrap(text('IDFC FIRST', '#9c1b28', 75, 16)) },
  indianBank:   { img: 'indianBank.png',               el: wrap(text('Indian Bank', '#14367d', 75, 15)) },
  indusind:     { img: 'indusind.png',                 el: wrap(text('IndusInd Bank', '#9e2a2b', 75, 15)) },
  unionBank:    { img: 'unionBank.png',                el: wrap(text('Union Bank of India', '#e03127', 75, 13)) },
  alRajhi:      { img: 'alRajhi.png',                  el: wrap(text('alrajhi bank', '#3b1e8f', 75, 15)) },
  alliance:     { img: 'alliance.png',                 el: wrap(text('ALLIANCE BANK', '#0d2b57', 75, 14)) },
  bankRakyat:   { img: 'bankRakyat.png',               el: wrap(text('BANK RAKYAT', '#1257a6', 75, 15)) },
  bsn:          { img: 'bsn.jpg',                      el: wrap(text('BSN', '#3aa8a0', 75, 22)) },
  kfh:          { img: 'kfh.png',                      el: wrap(text('KFH', '#3fae2a', 75, 22)) },
  megaIcbc:     { img: 'megaIcbc.png',                 el: wrap(text('Mega Intl Commercial', '#8a6b2f', 75, 12)) },
  smtb:         { img: 'smtb.png',                     el: wrap(text('Sumitomo Mitsui Trust', '#2f7a63', 75, 12)) },
  tisco:        { img: 'tisco.png',                    el: wrap(text('TISCO', '#12569e', 75, 20)) },
  gxs:          { img: 'GxsBank.png',                  el: wrap(text('GXS', '#c02a8f', 75, 22)) },
  trustBank:    { img: 'trustBank.png',                el: wrap(text('trust', '#29a3dc', 75, 20)) },
};

/* The marquee mirrors public.banks: the same institutions, under the same
   names, in the same display_order the calculator's bank dropdown uses. A bank
   in this carousel is therefore always a bank a visitor can actually benchmark.
   Keep these lists in step with the banks table when a market gains or drops
   an institution. */
const set = (pairs) => pairs.map(([slug, name]) => ({ name, img: `${LOGO_DIR}/${B[slug].img}`, el: B[slug].el }));

// Singapore — also the default list, and the calculator's offline fallback.
export const BANK_LOGOS = set([
  ['dbs', 'DBS'], ['posb', 'POSB'], ['ocbc', 'OCBC'], ['uob', 'UOB'],
  ['stanchart', 'Standard Chartered'], ['citi', 'Citibank'], ['hsbc', 'HSBC'],
  ['maybank', 'Maybank'], ['bankOfChina', 'Bank of China'], ['cimb', 'CIMB'],
  ['rhb', 'RHB'], ['mufg', 'MUFG Bank'], ['mizuho', 'Mizuho'],
  ['sbi', 'State Bank of India'], ['bnp', 'BNP Paribas'],
]);

// India
const IN_LOGOS = set([
  ['sbi', 'State Bank of India'], ['hdfc', 'HDFC Bank'], ['icici', 'ICICI Bank'],
  ['axis', 'Axis Bank'], ['kotak', 'Kotak Mahindra Bank'], ['pnb', 'Punjab National Bank'],
  ['baroda', 'Bank of Baroda'], ['yes', 'Yes Bank'], ['stanchart', 'Standard Chartered'],
  ['hsbc', 'HSBC'], ['citi', 'Citibank'], ['dbs', 'DBS Bank India'],
  ['mufg', 'MUFG Bank'], ['deutsche', 'Deutsche Bank'], ['bnp', 'BNP Paribas'],
]);

// Malaysia
const MY_LOGOS = set([
  ['maybank', 'Maybank'], ['cimb', 'CIMB'], ['publicBank', 'Public Bank'], ['rhb', 'RHB'],
  ['hongLeong', 'Hong Leong Bank'], ['ambank', 'AmBank'], ['bankIslam', 'Bank Islam'],
  ['affin', 'Affin Bank'], ['stanchart', 'Standard Chartered'], ['hsbc', 'HSBC'],
  ['ocbc', 'OCBC'], ['uob', 'UOB'], ['bankOfChina', 'Bank of China'],
  ['mufg', 'MUFG Bank'], ['bnp', 'BNP Paribas'],
]);

// Indonesia
const ID_LOGOS = set([
  ['mandiri', 'Bank Mandiri'], ['bca', 'Bank Central Asia'], ['bri', 'Bank Rakyat Indonesia'],
  ['bni', 'Bank Negara Indonesia'], ['cimbNiaga', 'CIMB Niaga'], ['danamon', 'Bank Danamon'],
  ['permata', 'Permata Bank'], ['panin', 'Panin Bank'], ['maybank', 'Maybank Indonesia'],
  ['ocbc', 'OCBC Indonesia'], ['uob', 'UOB Indonesia'], ['stanchart', 'Standard Chartered'],
  ['hsbc', 'HSBC'], ['mufg', 'MUFG Bank'], ['bnp', 'BNP Paribas'],
]);

// Thailand
const TH_LOGOS = set([
  ['bangkokBank', 'Bangkok Bank'], ['kasikorn', 'Kasikornbank'], ['scb', 'Siam Commercial Bank'],
  ['krungthai', 'Krungthai Bank'], ['ayudhya', 'Bank of Ayudhya'], ['ttb', 'TMBThanachart'],
  ['kkp', 'Kiatnakin Phatra'], ['lhb', 'LH Bank'], ['uob', 'UOB Thailand'],
  ['cimb', 'CIMB Thai'], ['stanchart', 'Standard Chartered'], ['hsbc', 'HSBC'],
  ['icbc', 'ICBC Thai'], ['mufg', 'MUFG Bank'], ['bnp', 'BNP Paribas'],
]);

/* Per-market logo sets for the "Banks & Companies We Track" marquee. Defaults to
   the Singapore set for any market we don't have a curated list for. */
export const MARKET_LOGOS = { SG: BANK_LOGOS, IN: IN_LOGOS, MY: MY_LOGOS, ID: ID_LOGOS, TH: TH_LOGOS };
export const logosForMarket = (code) => MARKET_LOGOS[String(code || 'SG').toUpperCase()] || BANK_LOGOS;

/* Banks the RATE DATA can name that the carousel does not carry.
 *
 * Kept separate from MARKET_LOGOS on purpose. That list mirrors public.banks
 * exactly — same institutions, same names, same display_order — so every logo
 * on the marquee is a bank a visitor can actually benchmark. The rate pools
 * reach wider than those 15, and pouring the extras into the same array would
 * quietly break that guarantee and put banks in the marquee that the calculator
 * has no dropdown entry for.
 *
 * So: the carousel reads MARKET_LOGOS, the reveal reads both.
 */
const EXTRA_LOGOS = {
  SG: set([['gxs', 'GXS Bank'], ['trustBank', 'Trust Bank'], ['icbc', 'ICBC']]),
  IN: set([
    ['canara', 'Canara Bank'], ['centralBank', 'Central Bank of India'],
    ['idfcFirst', 'IDFC First Bank'], ['indianBank', 'Indian Bank'],
    ['indusind', 'IndusInd Bank'], ['unionBank', 'Union Bank of India'],
  ]),
  MY: set([
    ['alliance', 'Alliance Bank'], ['bankRakyat', 'Bank Rakyat'],
    ['bsn', 'Bank Simpanan Nasional'], ['alRajhi', 'Al Rajhi Bank'],
    ['kfh', 'Kuwait Finance House'], ['citi', 'Citibank'],
    ['bangkokBank', 'Bangkok Bank'], ['icbc', 'ICBC'],
  ]),
  ID: [],
  TH: set([
    ['bankOfChina', 'Bank of China'], ['megaIcbc', 'Mega International Commercial Bank'],
    ['smtb', 'Sumitomo Mitsui Trust Bank'], ['tisco', 'TISCO Bank'],
  ]),
};

/* One bank's logo, for a bank NAME that came from the rate data.
 *
 * THE MISMATCH THIS SOLVES
 *   The lists above are brand names ("Krungthai Bank", "Maybank", "UOB"). The
 *   names on a benchmark come from product_rates.bank, which is whatever the
 *   published rate table called the legal entity — "Krung Thai Bank",
 *   "Malayan Banking Berhad", "United Overseas Bank (Malaysia) Bhd.". Matching
 *   the two strings directly finds almost nothing, which is why the reveal
 *   showed a name with no mark beside it.
 *
 * WHY NOT FUZZY MATCHING
 *   Because this runs on the screen someone has just PAID for. Putting one
 *   bank's logo next to another bank's name is worse than showing no logo at
 *   all — it is a false statement about who is offering the rate. So there are
 *   exactly two ways to match, both exact:
 *     1. both names reduce to the same key under normalise(), or
 *     2. a human wrote the pair into ALIASES below.
 *   No substring matching, no edit distance, no "close enough". A bank we have
 *   not mapped shows its name alone, which is honest and looks fine.
 */

/* Strip a name down to the brand inside it. Every removal here is a word that
   appears in a LEGAL name but never distinguishes one bank from another in the
   same market: entity forms (Berhad, Bhd, PCL, Tbk), the word "bank" itself,
   and the country qualifier a foreign branch carries ("(Thai)", "Malaysia").
   Applied to BOTH sides, so it only has to be consistent, not clever. */
const NOISE = /\b(?:bank|banking|berhad|bhd|public company limited|limited|ltd|plc|pcl|tbk|persero|corporation|corp|company|co|group|holdings|incorporated|inc|nv|sa|ag)\b/g;
/* Country words a FOREIGN BRANCH carries but the brand does not. "thai" is
   deliberately absent: it is part of real brand names here — Krung Thai Bank,
   CIMB Thai, Thai Credit Bank — and stripping it turned "Krung Thai Bank" into
   "krung", which matched nothing. A "(Thai)" suffix is removed by the
   parenthetical rule above instead, which is where that qualifier actually
   lives. */
const QUALIFIER = /\b(?:malaysia|malaysian|indonesia|indonesian|india|indian|singapore|amanah|islamic|saadiq|al-amin)\b/g;

function normalise(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // drop diacritics
    .replace(/\([^)]*\)/g, ' ')                         // "(Malaysia)", "(Thai)"
    .replace(NOISE, ' ')
    .replace(QUALIFIER, ' ')
    .replace(/[^a-z0-9]/g, '');                         // "krung thai" -> "krungthai"
}

/* Pairs normalise() cannot bridge, because the legal name and the brand share
   no words. Each line is a deliberate statement that these are the same bank in
   that market — the only place a human judgement belongs in this file.

   Written as the FULL name on the left, not a pre-reduced key, and normalised
   at load. Hand-computed keys are how the first version of this table silently
   did nothing: "Malayan Banking Berhad" reduces to "malayan", not to
   "malayanbanking", and the entry never fired. */
const ALIAS_PAIRS = {
  MY: [
    ['Malayan Banking Berhad', 'Maybank'],
    ['United Overseas Bank (Malaysia) Bhd.', 'UOB'],
    ['Al Rajhi Banking & Investment Corporation (Malaysia) Berhad', 'Al Rajhi Bank'],
    ['Bank Kerjasama Rakyat Malaysia Berhad', 'Bank Rakyat'],
    ['Industrial and Commercial Bank of China (Malaysia) Berhad', 'ICBC'],
  ],
  TH: [
    ['Land and Houses Bank', 'LH Bank'],
    ['United Overseas Bank (Thai)', 'UOB Thailand'],
    ['Industrial and Commercial Bank of China (Thai)', 'ICBC Thai'],
  ],
  ID: [],
  IN: [],
  SG: [],
};

const ALIASES = Object.fromEntries(
  Object.entries(ALIAS_PAIRS).map(([cc, pairs]) =>
    [cc, Object.fromEntries(pairs.map(([legal, brand]) => [normalise(legal), brand]))]),
);

export function logoForBank(country, name) {
  const raw = String(name || '').trim();
  if (!raw) return null;
  const cc = String(country || 'SG').toUpperCase();
  const list = [...logosForMarket(cc), ...(EXTRA_LOGOS[cc] || [])];

  const byName = (n) => list.find((b) => b.name === n) || null;

  // 1. Exact, as stored.
  const exact = list.find((b) => b.name.toLowerCase() === raw.toLowerCase());
  if (exact) return exact;

  // 2. A human-declared alias for this market.
  const key = normalise(raw);
  if (!key) return null;
  const aliased = ALIASES[cc]?.[key];
  if (aliased) return byName(aliased);

  // 3. Same brand once both sides are reduced. Ambiguity is treated as failure:
  //    if two banks in one market reduce to the same key we cannot tell them
  //    apart, so neither gets a logo.
  const hits = list.filter((b) => normalise(b.name) === key);
  return hits.length === 1 ? hits[0] : null;
}
