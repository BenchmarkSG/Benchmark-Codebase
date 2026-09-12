/* -----------------------------------------------------------------------------
 * FeeOptima — per-bank rate scraper for sources with no API
 *
 * Every source here was verified by hand against the page's own table markup.
 * The rule that matters: NOTHING is inferred. A source declares the exact table
 * (by a header pattern), the exact row (by a label pattern) and the exact column
 * (by index), and if any of those stops matching the source FAILS LOUDLY and is
 * skipped. A page redesign therefore yields "0 rows", never a wrong number
 * silently filed under a real bank's name.
 *
 * That guard is not theoretical. Asking a model to read BCA's SBDK table
 * returned KPR = 6.82 and Non-KPR = 9.06; the actual columns are KPR = 9.06 and
 * Non-KPR = 8.37 — it had shifted by two columns. Deterministic parsing only.
 *
 * Rows are written as REAL (is_indicative = false) by import-pool.mjs.
 *
 * Usage:
 *   node scripts/scrape-pool.mjs            # fetch all, print, write CSVs
 *   node scripts/scrape-pool.mjs IN         # one country
 * --------------------------------------------------------------------------- */
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseRate, formatRate } from './lib/rate-text.mjs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const OUT_DIR = 'data/rate-templates';

/* --- HTML table parsing (no dependencies; these pages are server-rendered) --- */
const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '\u2013', mdash: '\u2014', percnt: '%' };
const strip = (s) => s
  .replace(/<[^>]+>/g, ' ')
  // Decode BEFORE collapsing: HDFC writes "1 Year to &lt; 15 months", and a
  // selector matching the visible text would never match the raw entity.
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? ' ')
  .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
  .replace(/\s+/g, ' ').trim();

/* The page's visible text — scripts, styles and tags removed, whitespace
   collapsed — for the `text` mode below. */
function bodyText(htmlText) {
  return strip(uncommented(htmlText).replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, ' '));
}

// SBI's personal-loan page keeps last quarter's table inside an HTML comment
// next to the live one. A commented-out table is not published — drop it
// before anything is matched.
const uncommented = (htmlText) => htmlText.replace(/<!--[\s\S]*?-->/g, ' ');

function tables(htmlText) {
  return [...uncommented(htmlText).matchAll(/<table[\s\S]*?<\/table>/gi)].map((m) => {
    const rows = [...m[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((r) =>
      [...r[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => strip(c[1])));
    return rows.filter((r) => r.some(Boolean));
  });
}

/** Pick a value by (header pattern, row pattern, column index) or throw.
 *  `col` is one index, or [lowIdx, highIdx] when a page prints the two ends of
 *  a range in separate columns. `basis` forces 'from' when the page says
 *  "starting from" in a heading rather than in the cell — the number is still
 *  read from the cell. The cell text goes through lib/rate-text.mjs, which
 *  decides exact / range (midpoint) / from and refuses anything else. */
/* A cell in `table`: the first row matching `row` — searching from just after
   the first row matching `after`, when given, so "CRG : 4" can mean the one in
   the housing section rather than the first on the page. */
function cellAt(table, { after, row, col }, label) {
  let start = 0;
  if (after) {
    const i = table.findIndex((r) => after.test(r.join(' ')));
    if (i < 0) throw new Error(`${label}: no row matching ${after}`);
    start = i;
  }
  const hit = table.slice(start).find((r) => row.test(r.join(' ')));
  if (!hit) throw new Error(`${label}: no row matching ${row}${after ? ` after ${after}` : ''}`);
  return { hit, text: String(hit[col] ?? '') };
}

function pick(htmlText, { header, row, col, label, extract, basis, text, html, range }) {
  // `range` mode: the two ends of a published range sit in DIFFERENT rows —
  // Canara prints one row per credit-risk grade, so the range for "other
  // borrowers" runs from the CRG-PRIME row's rate to the CRG-4 row's rate.
  if (range) {
    const all = tables(htmlText);
    const table = all.find((t) => t.some((r) => header.test(r.join(' '))));
    if (!table) throw new Error(`no table matching header ${header}`);
    const lo = cellAt(table, range.low, `${label} low`), hi = cellAt(table, range.high, `${label} high`);
    let parsed;
    try { parsed = parseRate(`${lo.text} - ${hi.text}`); }
    catch (e) { throw new Error(`"${lo.text}" – "${hi.text}": ${e.message}`); }
    if (parsed.basis !== 'range') throw new Error(`rows give "${lo.text}" and "${hi.text}" — not a range`);
    return { ...parsed, evidence: `${label}: [${lo.hit.slice(0, 9).join(' | ')}] col ${range.low.col} → [${hi.hit.slice(0, 9).join(' | ')}] col ${range.high.col}` };
  }
  // `html` mode: the rate is tied to its product only by markup — SBI keeps
  // one panel per product, matched to a <select> by index — so the pattern runs
  // over the raw HTML and must span from the product's own label to its rate.
  // The capture is stripped of tags before it is read.
  if (html) {
    const m = uncommented(htmlText).match(html);
    if (!m) throw new Error(`page markup does not match ${String(html).slice(0, 80)}…`);
    const phrase = strip(m[1] ?? m[0]);
    let parsed;
    try { parsed = parseRate(phrase, { basis }); }
    catch (e) { throw new Error(`"${phrase.slice(0, 80)}": ${e.message}`); }
    return { ...parsed, evidence: `${label}: markup → "${phrase.slice(0, 120)}"` };
  }
  // `text` mode: the rate is in a sentence ("DBS Personal Loan … from 1.48% p.a.
  // (EIR 3.22% p.a.)"), not a table. The pattern must name the product in the
  // bank's own words and capture the rate phrase as group 1; it is matched
  // against the visible text of the page and fails if it does not occur.
  if (text) {
    const m = bodyText(htmlText).match(text);
    if (!m) throw new Error(`page text does not match ${text}`);
    let parsed;
    try { parsed = parseRate(m[1] ?? m[0], { basis }); }
    catch (e) { throw new Error(`"${m[0].slice(0, 80)}": ${e.message}`); }
    return { ...parsed, evidence: `${label}: "${m[0].replace(/\s+/g, ' ').slice(0, 160)}"` };
  }
  const all = tables(htmlText);
  if (!all.some((t) => t.some((r) => header.test(r.join(' '))))) {
    throw new Error(`no table matching header ${header}`);
  }
  // Both must hold in the SAME table: Hong Leong Finance repeats an identical
  // header across two tables and only the second carries the amount tier we want.
  const table = all.find((t) => t.some((r) => header.test(r.join(' '))) && t.some((r) => row.test(r.join(' '))));
  if (!table) throw new Error(`no table with both header ${header} and row ${row}`);
  const hit = table.find((r) => row.test(r.join(' ')));
  const cols = Array.isArray(col) ? col : [col];
  const texts = cols.map((c) => {
    const text = String(hit[c] ?? '');
    // A cell like "1.35% p.a. (placement in branch) / 1.40% p.a. (online banking)"
    // holds two rates; `extract` names the one we mean, by its own words.
    const picked = extract ? text.match(extract)?.[1] : text;
    if (extract && picked == null) throw new Error(`cell "${text}" did not match ${extract}`);
    return String(picked);
  });
  let parsed;
  try {
    parsed = parseRate(texts.length === 2 ? `${texts[0]} - ${texts[1]}` : texts[0], { basis });
  } catch (e) {
    throw new Error(`column ${cols.join('/')} of "${hit[0]}": ${e.message}`);
  }
  return { ...parsed, evidence: `${label}: [${hit.slice(0, 8).join(' | ')}] → col ${cols.join('/')} "${texts.join(' | ')}"` };
}

/* --- Sources -----------------------------------------------------------------
 * India: 1-year retail term-deposit rate for the general public (not senior
 * citizen, not bulk/non-callable) — the one tenor every bank publishes.
 * Indonesia: OJK-mandated SBDK table, whose 7 columns are fixed by regulation:
 *   [0] Corporate [1] Retail [2] Medium [3] Small [4] Micro [5] KPR [6] Non-KPR
 * KPR is the housing base rate, Non-KPR the non-housing consumer base rate.
 */
const SG_COMPARE = 'https://blog.moneysmart.sg/fixed-deposits/best-fixed-deposit-accounts-singapore/';

const SOURCES = [
  { country: 'IN', product: 'fixed_deposit', bank: 'State Bank of India',
    url: 'https://sbi.co.in/web/interest-rates/deposit-rates/retail-domestic-term-deposits',
    header: /Tenors.*Rates for Public/i, row: /^1 Year to less than 2 years/i, col: 2, label: 'SBI 1y public' },
  { country: 'IN', product: 'fixed_deposit', bank: 'Punjab National Bank',
    url: 'https://www.pnbindia.in/interest-rates-deposit.html',
    header: /Period.*Revised Rates For Public/i, row: /^\d+ 1 Year \d/i, col: 2, label: 'PNB 1y public' },
  { country: 'IN', product: 'fixed_deposit', bank: 'HDFC Bank',
    url: 'https://www.hdfcbank.com/personal/resources/rates',
    header: /Tenure Bucket/i, row: /^1 Year to < 15 months/i, col: 1, label: 'HDFC 1y public' },
  { country: 'IN', product: 'fixed_deposit', bank: 'Axis Bank',
    url: 'https://www.axisbank.com/interest-rate-on-deposits',
    header: /Maturity Period.*General.*Senior Citizens/i, row: /^1 year to 1 year 10 days/i, col: 1, label: 'Axis 1y general <3Cr' },
  { country: 'IN', product: 'fixed_deposit', bank: 'IndusInd Bank',
    url: 'https://www.indusind.com/in/en/personal/rates.html',
    header: /< 3 Cr\* DOMESTIC \(RESIDENT\)/i, row: /^1 Year to below 1 Year 6 Month/i, col: 1, label: 'IndusInd 1y domestic <3Cr' },
  { country: 'IN', product: 'fixed_deposit', bank: 'Central Bank of India',
    url: 'https://www.centralbankofindia.co.in/en/interest-rates-on-deposit',
    header: /Revised Rate/i, row: /^12 month to 13 months/i, col: 1, label: 'Central Bank 1y revised' },
  { country: 'IN', product: 'fixed_deposit', bank: 'Kotak Mahindra Bank', render: true,
    url: 'https://www.kotak.com/en/personal-banking/deposits/fixed-deposit/fixed-deposit-interest-rate.html',
    header: /Premature Withdrawal Allowed.*Less than Rs\.3 Crore/i, row: /^365 Days to less than 15 Months/i, col: 1, label: 'Kotak 1y regular <3Cr' },
  { country: 'IN', product: 'fixed_deposit', bank: 'Indian Bank', render: true,
    url: 'https://www.indianbank.in/departments/deposit-rates/',
    header: /Period \/ Tenor of Deposit.*Less than Rs\.3 crore/i, row: /^1 year \d/i, col: 2, label: 'Indian Bank 1y revised <3Cr' },
  { country: 'IN', product: 'fixed_deposit', bank: 'Bank of Baroda', render: true,
    url: 'https://bankofbaroda.bank.in/interest-rate-and-service-charges/deposits-interest-rates/fixed-deposits-callable-and-non-callable-upto-ten-crores',
    header: /Tenors.*Residents \/ General Public/i, row: /^1 year \d/i, col: 1, label: 'BoB 1y callable general <3Cr' },
  { country: 'IN', product: 'fixed_deposit', bank: 'IDFC First Bank',
    url: 'https://www.idfcfirstbank.com/personal-banking/deposits/fixed-deposit/fd-interest-rates',
    header: /\d\.\d/, row: /^1 year\s*[–-]\s*370 days/i, col: 1, label: 'IDFC First 1y public' },

  /* Singapore — best published 12-month SGD rate a standard retail customer can
   * get with a placement of UP TO S$20,000 (the threshold most promotions use).
   * The amount is part of the basis, not a detail: DBS pays 1.00% below S$20,000
   * and 0.05% above it, so the placement size has to be pinned before rates
   * across banks mean anything side by side.
   *
   * Two banks are read from their own pages. The rest come from MoneySmart's
   * monthly comparison (rendered; one fetch serves every row), which was
   * checked against the four banks readable directly — DBS, Hong Leong
   * Finance, HSBC, Standard Chartered — and matched all four exactly. The
   * banks' own pages either block headless browsers (OCBC), publish no rate
   * table (UOB), or refuse the connection outright (Maybank).
   *
   * Excluded on the basis, each for a stated reason:
   *   HSBC          — promo needs SGD30,000 fresh funds; every tier is Premier
   *   Std Chartered — 6-month promo only, no 12-month product
   *   SBI Singapore — promo needs S$50,000
   *   HL Bank       — 3/6/9-month promo only
   */
  { country: 'SG', product: 'fixed_deposit', bank: 'DBS',
    url: 'https://www.dbs.com.sg/personal/rates-online/fixed-deposit-rate-singapore-dollar.page',
    header: /Period.*\$10,000 - \$19,999/i, row: /^12 mths/i, col: 2, label: 'DBS 12m board @ S$10k' },
  { country: 'SG', product: 'fixed_deposit', bank: 'Hong Leong Finance',
    url: 'https://www.hlf.com.sg/personal/promotions/fixed-deposits-promotion-singapore.php',
    header: /Deposit Amount.*12-Month/i, row: /S\$20,000 and above/i, col: 3, label: 'HLF 12m promo @ S$20k' },

  // MoneySmart comparison — one rendered page, several banks. Each selector is
  // the bank's own table on that page (the header text is unique per bank).
  { country: 'SG', product: 'fixed_deposit', bank: 'OCBC', render: true,
    url: SG_COMPARE, header: /Deposit amount of \$20,000 and above/i, row: /^12 months/i, col: 1,
    extract: /([\d.]+)% p\.a\. \(online banking\)/i, label: 'OCBC 12m online @ S$20k' },
  { country: 'SG', product: 'fixed_deposit', bank: 'UOB', render: true,
    url: SG_COMPARE, header: /UOB fixed deposit rates \(minimum deposit amount: \$10,000\)/i, row: /^12 months/i, col: 1,
    extract: /^([\d.]+)%/, label: 'UOB 12m regular @ S$10k' },
  { country: 'SG', product: 'fixed_deposit', bank: 'Maybank', render: true,
    url: SG_COMPARE, header: /Maybank fixed deposit promotional rates \(minimum \$20,000 placement\)/i, row: /^12 months/i, col: 1,
    extract: /^([\d.]+)% p\.a\. \(branches \/ online\)/i, label: 'Maybank 12m branches/online @ S$20k' },
  { country: 'SG', product: 'fixed_deposit', bank: 'CIMB', render: true,
    url: SG_COMPARE, header: /Personal Banking \(For regular CIMB customers\)/i, row: /^12 months/i, col: 1,
    label: 'CIMB 12m personal @ S$10k' },
  { country: 'SG', product: 'fixed_deposit', bank: 'Bank of China', render: true,
    url: SG_COMPARE, header: /mobile banking, minimum \$500 unless otherwise stated/i, row: /^12 months/i, col: 1,
    extract: /^([\d.]+)%/, label: 'BoC 12m mobile @ S$500' },
  { country: 'SG', product: 'fixed_deposit', bank: 'RHB', render: true,
    url: SG_COMPARE, header: /Personal banking.*Premier banking/i, row: /^12 months/i, col: 1,
    extract: /^([\d.]+)% p\.a\. \(branch placement\)/i, label: 'RHB 12m personal branch @ S$20k' },
  { country: 'SG', product: 'fixed_deposit', bank: 'ICBC', render: true,
    url: SG_COMPARE, header: /\$20,000 to <\$200,000 \(via e-banking\)/i, row: /^12 months/i, col: 3,
    label: 'ICBC 12m e-banking @ S$20k' },
  { country: 'SG', product: 'fixed_deposit', bank: 'Citibank', render: true,
    url: SG_COMPARE, header: /deposits \$10,000 to \$3,000,000 \(Board rates\)/i, row: /^12 months/i, col: 1,
    label: 'Citi 12m board @ S$10k' },

  /* Malaysia — best published 12-month MYR rate an individual can get with a
   * placement of RM1,000–10,000: the promotional / e-FD rate where the bank
   * publishes one (Hong Leong, AmBank), the counter or board rate otherwise.
   * Decided 12 Sep 2026 ("the rate that is best available for the customer").
   * Relationship-tier offers are out: Standard Chartered's 3.75% needs
   * Priority Banking and RM60,000. Not readable: Maybank (refuses), Public
   * Bank / OCBC / UOB / Bank Islam / Affin / Bank of China (blank or blocked),
   * HSBC (image PDF). CIMB is HELD, deliberately: its board rate (1.90%) is
   * readable but its live eFD campaign ("up to 3.75%", 12-month tenure
   * included) publishes the tenor rates only as an image, so the figure the
   * basis calls for cannot be read — loading 1.90% would misstate it.
   */
  { country: 'MY', product: 'fixed_deposit', bank: 'Hong Leong Bank', render: true,
    url: 'https://www.hlb.com.my/en/personal-banking/promotions/dp-efd-campaign.html',
    header: /Effective Date.*Tenure.*Promotion Rate.*Minimum Placement/i, row: /\b12 months\b/i, col: 2, label: 'HLB eFD campaign 12m' },
  { country: 'MY', product: 'fixed_deposit', bank: 'AmBank', render: true,
    url: 'https://www.ambank.com.my/promotions/eFD-eTDi/',
    header: /Promotional Rate.*Reward Code/i, row: /^12-month/i, col: 0, extract: /([\d.]+% p\.a\.)/i, label: 'AmBank eFD promo 12m' },
  { country: 'MY', product: 'fixed_deposit', bank: 'Alliance Bank', render: true,
    url: 'https://www.alliancebank.com.my/Interest-Rates',
    header: /Tenure \(Months\).*Counter Rate.*2nd Tier Rate.*for Individual/i, row: /^12 /, col: 1, label: 'Alliance conventional FD 12m counter' },
  { country: 'MY', product: 'fixed_deposit', bank: 'Bank Rakyat', render: true,
    url: 'https://www.bankrakyat.com.my/portal-main/article/term-deposit-i-account',
    header: /PERIOD OF DEPOSIT \(MONTH\).*RATES \(%\) INDIVIDUAL/i, row: /^12 /, col: 1, label: 'Bank Rakyat TD-i 12m individual' },
  // Three RHB tables share the header "Tenure | Rates (p.a.)"; only the
  // Ordinary Fixed Deposit table carries a "7-11 Months" row, so that row is
  // the anchor rather than the header.
  { country: 'MY', product: 'fixed_deposit', bank: 'RHB', render: true,
    url: 'https://www.rhbgroup.com/others/rates/index.html',
    header: /^7-11 Months/i, row: /^12 Months/i, col: 1, label: 'RHB ordinary FD 12m board' },

  { country: 'ID', product: 'housing_loan', bank: 'Bank Central Asia',
    url: 'https://www.bca.co.id/en/informasi/Suku-Bunga-Dasar-Kredit',
    header: /Housing Loan/i, row: /Prime Lending Rate \(SBDK\)/i, col: 6, label: 'BCA SBDK KPR' },
  { country: 'ID', product: 'personal_loan', bank: 'Bank Central Asia',
    url: 'https://www.bca.co.id/en/informasi/Suku-Bunga-Dasar-Kredit',
    header: /Non-Housing Loan/i, row: /Prime Lending Rate \(SBDK\)/i, col: 7, label: 'BCA SBDK Non-KPR' },
  { country: 'ID', product: 'housing_loan', bank: 'Bank Mandiri', render: true,
    url: 'https://www.bankmandiri.co.id/suku-bunga-dasar-kredit',
    header: /KPR\/KPA/i, row: /Suku Bunga Dasar Kredit \(SBDK\)/i, col: 6, label: 'Mandiri SBDK KPR' },
  { country: 'ID', product: 'personal_loan', bank: 'Bank Mandiri', render: true,
    url: 'https://www.bankmandiri.co.id/suku-bunga-dasar-kredit',
    header: /Non KPR \/ Non KPA/i, row: /Suku Bunga Dasar Kredit \(SBDK\)/i, col: 7, label: 'Mandiri SBDK Non-KPR' },
  { country: 'ID', product: 'housing_loan', bank: 'CIMB Niaga', render: true,
    url: 'https://www.cimbniaga.co.id/id/tentang-kami/berita/suku-bunga-dasar-kredit',
    header: /Periode Data.*KPR \/ KPA/i, row: /^Suku Bunga Dasar Kredit \(SBDK\)/i, col: 6, label: 'CIMB Niaga SBDK KPR' },
  { country: 'ID', product: 'personal_loan', bank: 'CIMB Niaga', render: true,
    url: 'https://www.cimbniaga.co.id/id/tentang-kami/berita/suku-bunga-dasar-kredit',
    header: /Periode Data.*NonKPR \/ NonKPA/i, row: /^Suku Bunga Dasar Kredit \(SBDK\)/i, col: 7, label: 'CIMB Niaga SBDK Non-KPR' },
  { country: 'ID', product: 'housing_loan', bank: 'OCBC Indonesia', render: true,
    url: 'https://www.ocbc.id/en/suku-bunga-dasar',
    header: /Data Period.*KPR\/ KPA/i, row: /^Prime Lending Rate \(SBDK\)/i, col: 6, label: 'OCBC ID SBDK KPR' },
  { country: 'ID', product: 'personal_loan', bank: 'OCBC Indonesia', render: true,
    url: 'https://www.ocbc.id/en/suku-bunga-dasar',
    header: /Data Period.*NonKPR\/ Non KPA/i, row: /^Prime Lending Rate \(SBDK\)/i, col: 7, label: 'OCBC ID SBDK Non-KPR' },
  { country: 'ID', product: 'housing_loan', bank: 'Bank Danamon',
    url: 'https://www.danamon.co.id/tentang-danamon/SBDK',
    header: /KPR \/ KPA/i, row: /SBDK|Suku Bunga Dasar Kredit/i, col: 6, label: 'Danamon SBDK KPR' },
  { country: 'ID', product: 'personal_loan', bank: 'Bank Danamon',
    url: 'https://www.danamon.co.id/tentang-danamon/SBDK',
    header: /Non KPR \/ Non KPA/i, row: /SBDK|Suku Bunga Dasar Kredit/i, col: 7, label: 'Danamon SBDK Non-KPR' },

  /* --- Loans published as ranges and floors (basis decided 11 Sep 2026) ------
   * A range lands as its midpoint (shown "~"), a floor as published (shown
   * "from") — see lib/rate-text.mjs. Every figure below is read from the
   * bank's OWN page; the Indian comparison sites were checked and rejected
   * (Paisabazaar's car-loan table is dated 2019, and both disagree with the
   * banks on several rows).
   *
   * India housing loan — the bank's standard floating home-loan rate for a
   * salaried borrower: the published range where the bank prints one (ICICI
   * by loan slab, Axis by credit score), else its advertised floor.
   * India personal loan — the bank's published effective-rate range, else the
   * advertised floor. HSBC's "Current interest rate ranges" row is the range.
   * India vehicle loan — new-car loan: SBI's published range, else the floor.
   *
   * Singapore personal loan — the lender's lowest advertised EFFECTIVE rate
   * (EIR), which every Singapore bank prints beside its flat rate; the flat
   * "1.48% p.a." is not comparable to a reducing-balance rate, the EIR is.
   * Read from each bank's page; MoneySmart's table was checked and differs
   * from DBS (2.84 vs the bank's 3.22) and GXS (an exclusive promo), so it is
   * not used here. OCBC blocks automated access, CIMB and MariBank render
   * nothing without their app, Citibank's page is empty.
   */
  { country: 'IN', product: 'housing_loan', bank: 'State Bank of India',
    url: 'https://sbi.co.in/web/interest-rates/interest-rates/loan-schemes-interest-rates/home-loans-interest-rates-current',
    // Site-wide rates panel: option value N ↔ panel id="menu-N"; 0 is Home Loan.
    html: /value="0">Home Loan<\/option>[\s\S]*?id="menu-0">[\s\S]{0,800}?accessibility-font-style">([\s\S]{0,80}?)<\/p>/,
    label: 'SBI home loan panel' },
  { country: 'IN', product: 'housing_loan', bank: 'ICICI Bank', render: true,
    url: 'https://www.icicibank.com/personal-banking/loans/home-loan/interest-rates',
    header: /Loan Slab.*Salaried.*Self - Employed/i, row: /^Up to .35 lakh/i, col: 1, label: 'ICICI standard HL, salaried, ≤₹35L' },
  { country: 'IN', product: 'housing_loan', bank: 'Axis Bank', render: true,
    url: 'https://www.axisbank.com/retail/loans/home-loan/interest-rates',
    header: /Cibil Score.*REPO \+ Spread.*Effective Rate of Interest/i, row: /^Cibil Score - 751 and above/i, col: 2, label: 'Axis HL, CIBIL 751+' },
  { country: 'IN', product: 'housing_loan', bank: 'Kotak Mahindra Bank', render: true,
    url: 'https://www.kotak.com/en/personal-banking/loans/home-loan/interest-rates.html',
    header: /Customer Type.*Effective Rate Of Interest/i, row: /^For Salaried & For Self-employed/i, col: 1, label: 'Kotak HL floating' },
  { country: 'IN', product: 'housing_loan', bank: 'Bank of Baroda', render: true,
    url: 'https://bankofbaroda.bank.in/personal-banking/loans/home-loan',
    text: /home loan starting @\s*([\d.]+%)/i, basis: 'from', label: 'BoB HL "starting @"' },
  { country: 'IN', product: 'housing_loan', bank: 'Union Bank of India', render: true,
    url: 'https://www.unionbankofindia.co.in/en/interest-rate/loans-and-advances',
    text: /(from [\d.]+%)\*? HOME LOAN/i, label: 'Union HL panel' },

  // Central Bank of India publishes one table of retail schemes with a
  // "Present Range" column. The production site (centralbank.bank.in) — not the
  // uat. subdomain, which carries different, older numbers.
  { country: 'IN', product: 'housing_loan', bank: 'Central Bank of India',
    url: 'https://centralbank.bank.in/en/retail-scheme-interest',
    header: /Scheme Name.*Rate of Interest \(Range\).*Present Range/i, row: /^\d+\. Cent Home \*/i, col: 3, label: 'Central Bank Cent Home range' },
  // HDFC blocks its main site to automation but the home-loans subdomain answers
  // a plain fetch. The cell is "Policy Repo Rate + 2.50% to 7.95%= 7.75% to
  // 13.20%": the spread range comes first, the rate range after the "=".
  { country: 'IN', product: 'housing_loan', bank: 'HDFC Bank',
    url: 'https://homeloans.hdfc.bank.in/housing-loans/home-loans',
    header: /Loan Slab.*Interest Rates \(% p\.a\.\)/i, row: /^For All Loans/i, col: 1,
    extract: /=\s*([\d.]+% to [\d.]+%)/, label: 'HDFC special HL, all loans' },
  // Canara publishes one row per credit-risk grade (CRG-PRIME … CRG-4) per
  // slab; the published range for a product is PRIME's rate to CRG-4's rate in
  // the "OTHER BORROWERS" effective-rate column (women borrowers get 5 bps off).
  { country: 'IN', product: 'housing_loan', bank: 'Canara Bank', render: true,
    url: 'https://www.canarabank.bank.in/pages/rates-of-interest-for-retail-lending-schemes-linked-to-rllr',
    header: /LOAN PRODUCT.*CRG.*RLLR.*WOMEN BORROWERS.*OTHER BORROWERS/i,
    range: { low: { row: /^HOUSING LOAN CRG-PRIME/i, col: 8 }, high: { after: /^HOUSING LOAN CRG-PRIME/i, row: /^CRG : 4/i, col: 7 } },
    label: 'Canara HL ≤₹50L, other borrowers, PRIME→CRG-4' },
  { country: 'IN', product: 'personal_loan', bank: 'State Bank of India',
    url: 'https://sbi.co.in/web/interest-rates/interest-rates/loan-schemes-interest-rates/personal-loans-schemes',
    header: /Spread over 2-year MCLR.*Effective Interest Rate/i, row: /^[\d.]+% - [\d.]+% [\d.]+% - [\d.]+%$/, col: 1, label: 'SBI personal loan effective range' },
  { country: 'IN', product: 'personal_loan', bank: 'ICICI Bank', render: true,
    url: 'https://www.icicibank.com/personal-banking/loans/personal-loan/interest-rates',
    header: /Particulars.*Interest rates and applicable charges/i, row: /^Personal Loan interest rates/i, col: 1, label: 'ICICI PL range' },
  { country: 'IN', product: 'personal_loan', bank: 'Kotak Mahindra Bank', render: true,
    url: 'https://www.kotak.com/en/personal-banking/loans/personal-loan/interest-rates.html',
    header: /Personal Loan Credit Facilities/i, row: /^Personal loan interest rate/i, col: 1, label: 'Kotak PL floor' },
  { country: 'IN', product: 'personal_loan', bank: 'HSBC', render: true,
    url: 'https://www.hsbc.co.in/loans/products/personal/',
    header: /^Description Details$/i, row: /^Current interest rate ranges/i, col: 1, label: 'HSBC IN PL range' },
  { country: 'IN', product: 'personal_loan', bank: 'IDFC First Bank', render: true,
    url: 'https://www.idfcfirstbank.com/personal-banking/loans/personal-loan',
    text: /(interest rates starting from [\d.]+% p\.a\.)/i, label: 'IDFC PL "starting from"' },
  { country: 'IN', product: 'personal_loan', bank: 'Union Bank of India', render: true,
    url: 'https://www.unionbankofindia.co.in/en/interest-rate/loans-and-advances',
    text: /(from [\d.]+%)\*? PERSONAL LOAN/i, label: 'Union PL panel' },

  { country: 'IN', product: 'personal_loan', bank: 'Central Bank of India',
    url: 'https://centralbank.bank.in/en/retail-scheme-interest',
    // "11.25% OR 11.75%" — one of two rates by internal risk grade; a range of two.
    header: /Scheme Name.*Rate of Interest \(Range\).*Present Range/i, row: /^\d+\. Cent Personal/i, col: 3, label: 'Central Bank Cent Personal' },
  { country: 'IN', product: 'personal_loan', bank: 'HDFC Bank',
    url: 'https://www.hdfc.bank.in/personal-loan',
    text: /Personal Loan at Affordable Rates (Starting From [\d.]+% p\.a\.)/i, label: 'HDFC PL "starting from"' },
  { country: 'IN', product: 'personal_loan', bank: 'Canara Bank', render: true,
    url: 'https://www.canarabank.bank.in/pages/rates-of-interest-for-retail-lending-schemes-linked-to-rllr',
    header: /LOAN PRODUCT.*CRG.*RLLR.*WOMEN BORROWERS.*OTHER BORROWERS/i,
    // Canara Budget-Prime with salary tie-up: the salaried personal loan.
    range: { low: { row: /^CANARA BUDGET-PRIME \(WITH SALARY TIE-UP\) CRG : 1/i, col: 4 }, high: { after: /^CANARA BUDGET-PRIME \(WITH SALARY TIE-UP\)/i, row: /^CRG : 4/i, col: 3 } },
    label: 'Canara Budget-Prime (salary tie-up), CRG-1→CRG-4' },
  { country: 'IN', product: 'vehicle_loan', bank: 'State Bank of India',
    url: 'https://sbi.co.in/web/interest-rates/interest-rates/loan-schemes-interest-rates/auto-loans',
    header: /1-year MCLR/i, row: /^i\) SBI Car Loan/i, col: 1, label: 'SBI car loan range' },
  { country: 'IN', product: 'vehicle_loan', bank: 'IDFC First Bank', render: true,
    url: 'https://www.idfcfirstbank.com/personal-banking/loans/car-loan',
    text: /(interest rates starting at [\d.]+%)/i, label: 'IDFC car loan "starting at"' },
  { country: 'IN', product: 'vehicle_loan', bank: 'Union Bank of India', render: true,
    url: 'https://www.unionbankofindia.co.in/en/interest-rate/loans-and-advances',
    text: /(from [\d.]+%)\*? VEHICLE LOAN/i, label: 'Union vehicle panel' },

  { country: 'IN', product: 'vehicle_loan', bank: 'Central Bank of India',
    url: 'https://centralbank.bank.in/en/retail-scheme-interest',
    header: /Scheme Name.*Rate of Interest \(Range\).*Present Range/i, row: /^\d+\. Cent Vehicle \(4-Wheeler\)/i, col: 3, label: 'Central Bank Cent Vehicle 4W' },
  { country: 'IN', product: 'vehicle_loan', bank: 'HDFC Bank',
    url: 'https://www.hdfc.bank.in/car-loan',
    text: /Car Loan[^%]{0,80}?Interest rate starting @\s*([\d.]+%)/i, basis: 'from', label: 'HDFC car loan "starting @"' },

  { country: 'IN', product: 'vehicle_loan', bank: 'Canara Bank', render: true,
    url: 'https://www.canarabank.bank.in/pages/rates-of-interest-for-retail-lending-schemes-linked-to-rllr',
    header: /LOAN PRODUCT.*CRG.*RLLR.*WOMEN BORROWERS.*OTHER BORROWERS/i,
    range: { low: { row: /^Canara Vehicle \(4 Wheeler Loans/i, col: 8 }, high: { after: /^Canara Vehicle \(4 Wheeler Loans/i, row: /^CRG : 4/i, col: 7 } },
    label: 'Canara Vehicle 4W ≤₹15L, other borrowers, PRIME→CRG-4' },

  // OCBC's loans overview renders for a browser (its product pages do not).
  // Cash-on-Instalments is its fixed-instalment personal loan for cardholders —
  // the same footing as DBS Personal Loan, which also draws on a card limit.
  { country: 'SG', product: 'personal_loan', bank: 'OCBC', render: true,
    url: 'https://www.ocbc.com/personal-banking/loans/personal-loans.page',
    text: /Cash-on-Instalments[\s\S]{0,400}?Rates from [\d.]+% p\.a\. \(EIR ([\d.]+% p\.a\.)\)/i, basis: 'from', label: 'OCBC Cash-on-Instalments EIR' },
  { country: 'SG', product: 'personal_loan', bank: 'DBS', render: true,
    url: 'https://www.dbs.com.sg/personal/loans/personal-loans/dbs-personal-loan',
    text: /DBS Personal Loan[^.]{0,80}?from [\d.]+% p\.a\. \(EIR ([\d.]+% p\.a\.)\)/i, basis: 'from', label: 'DBS PL EIR' },
  { country: 'SG', product: 'personal_loan', bank: 'UOB', render: true,
    url: 'https://www.uob.com.sg/personal/borrow/personal-loans/personal-loan.page',
    text: /UOB Personal Loan with low interest rates from [\d.]+% p\.a\. \(EIR ([\d.]+% p\.a\.)\)/i, basis: 'from', label: 'UOB PL EIR' },
  { country: 'SG', product: 'personal_loan', bank: 'Standard Chartered', render: true,
    url: 'https://www.sc.com/sg/borrow/loans/cashone/',
    text: /CashOne[\s\S]{0,300}?From [\d.]+% p\.a\. \(EIR (from [\d.]+% p\.a\.)\)/i, label: 'SC CashOne EIR' },
  { country: 'SG', product: 'personal_loan', bank: 'HSBC', render: true,
    url: 'https://www.hsbc.com.sg/loans/products/personal/',
    text: /as low as [\d.]+% p\.a\. \(EIR ([\d.]+% p\.a\.)/i, basis: 'from', label: 'HSBC SG PL EIR' },
  { country: 'SG', product: 'personal_loan', bank: 'Trust Bank', render: true,
    url: 'https://www.trustbank.sg/instant-loan',
    text: /lowest personal loan rate from [\d.]+% p\.a\., EIR (from [\d.]+% p\.a\.)/i, label: 'Trust Instant Loan EIR' },
  { country: 'SG', product: 'personal_loan', bank: 'GXS Bank', render: true,
    url: 'https://www.gxs.com.sg/flexiloan',
    text: /Instalment Loan Low interest rates from [\d.]+% p\.a\. \(EIR ([\d.]+% p\.a\.)\)/i, basis: 'from', label: 'GXS FlexiLoan EIR' },
];

const CCY = { SG: 'SGD', IN: 'INR', MY: 'MYR', ID: 'IDR', TH: 'THB' };
const RATE_TYPE = { fixed_deposit: 'yield', current_account: 'yield' };

const only = (process.argv.find((a) => /^[A-Z]{2}$/i.test(a)) || '').toUpperCase();
const wanted = SOURCES.filter((s) => !only || s.country === only);
const pages = new Map();

/* Some banks (Kotak, Indian Bank, Bank Mandiri…) build the rate table in the
   browser, so the raw HTML has no <table> at all. Sources marked `render: true`
   are loaded in headless Chromium and the DOM is read back after the page has
   settled and any collapsed sections have been opened. One browser per run. */
let browser = null;
async function fetchHtml(src) {
  const UA_H = { 'User-Agent': UA };
  if (!src.render) {
    const res = await fetch(src.url, { headers: UA_H, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }
  if (!browser) {
    const { pathToFileURL } = await import('node:url');
    const mod = await import(process.env.PW_PATH ? pathToFileURL(process.env.PW_PATH).href : 'playwright');
    browser = await mod.chromium.launch();
  }
  const page = await (await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 } })).newPage();
  try {
    await page.goto(src.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.$$eval('[aria-expanded="false"], summary', (els) => els.slice(0, 40).forEach((e) => { try { e.click(); } catch {} })).catch(() => {});
    await page.waitForTimeout(600);
    return await page.content();
  } finally {
    await page.context().close();
  }
}

const ok = [], failed = [];
for (const src of wanted) {
  try {
    if (!pages.has(src.url)) pages.set(src.url, await fetchHtml(src));
    const { value, basis, low, high, evidence } = pick(pages.get(src.url), src);
    ok.push({ ...src, rate: value, basis, low, high });
    console.log(`  ✓ ${src.country} ${src.product.padEnd(14)} ${src.bank.padEnd(22)} ${formatRate(value, basis)}`);
    console.log(`      ${evidence}`);
  } catch (e) {
    failed.push({ ...src, why: e.message });
    console.error(`  ✗ ${src.country} ${src.product.padEnd(14)} ${src.bank.padEnd(22)} ${e.message}`);
  }
}

// A pool is written only when EVERY source feeding it parsed. The importer
// replaces each (country, product) pool wholesale, so on an unattended run a
// single bank's redesign would otherwise shrink a 10-bank pool to 9 with nobody
// watching — the same "never empty the pool" rule the BOT and BNM feeds follow.
// The guard is per pool, not per country: one broken car-loan source must not
// hold back that night's fixed-deposit refresh. Pass --partial to override
// when running by hand.
const PARTIAL = process.argv.includes('--partial');
const poolOf = (r) => `${r.country}|${r.product}`;
const failedPools = new Set(failed.map(poolOf));
const byCountry = new Map();
const held = [];
for (const r of ok) {
  if (failedPools.has(poolOf(r)) && !PARTIAL) { held.push(r); continue; }
  if (!byCountry.has(r.country)) byCountry.set(r.country, []);
  byCountry.get(r.country).push(r);
}
for (const pool of [...new Set(held.map(poolOf))]) {
  const [cc, product] = pool.split('|');
  const n = failed.filter((f) => poolOf(f) === pool).length;
  console.log(`\n! ${cc} ${product}: ${n} source(s) failed — pool not written so it can't shrink (use --partial to force)`);
}
mkdirSync(OUT_DIR, { recursive: true });
for (const [cc, rows] of byCountry) {
  // rate_basis / rate_low / rate_high: how the lender published it (see
  // lib/rate-text.mjs). A range lands as its midpoint with both bounds kept.
  const csv = ['country,product,bank,rate,currency,rate_type,rate_basis,rate_low,rate_high',
    ...rows.map((r) => `${cc},${r.product},"${r.bank}",${r.rate},${CCY[cc]},${RATE_TYPE[r.product] || 'apr'},${r.basis},${r.low ?? ''},${r.high ?? ''}`)];
  const file = `${OUT_DIR}/scraped-${cc}.csv`;
  writeFileSync(file, `${csv.join('\n')}\n`);
  const pools = [...new Set(rows.map((r) => r.product))];
  console.log(`\n→ ${file} (${rows.length} rows: ${pools.map((p) => `${p} ×${rows.filter((r) => r.product === p).length}`).join(', ')})`);
}
if (browser) await browser.close();
console.log(`\n${ok.length} scraped, ${failed.length} failed.`);
if (failed.length) console.log('  Failures are skipped, never guessed — fix the selector or drop the source.');
