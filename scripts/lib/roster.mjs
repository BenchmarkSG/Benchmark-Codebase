/* The market roster — which countries we cover and which providers make up each
 * country's pool. Shared by the seeder and by make-import-template.mjs so a
 * template can never offer a bank the app doesn't know about.
 *
 * `category` drives display grouping (and, in the seeder only, a pricing tilt).
 * 'fintech' entries are directory-only: they appear as a provider a user can
 * name, but they are not put in a benchmark pool.
 */
// --- reference: countries -----------------------------------------------------
export const COUNTRIES = [
  { code: 'SG', name: 'Singapore', currency: 'SGD', currency_symbol: 'S$', display_order: 1 },
  { code: 'IN', name: 'India', currency: 'INR', currency_symbol: '₹', display_order: 2 },
  { code: 'MY', name: 'Malaysia', currency: 'MYR', currency_symbol: 'RM', display_order: 3 },
  { code: 'ID', name: 'Indonesia', currency: 'IDR', currency_symbol: 'Rp', display_order: 4 },
  { code: 'TH', name: 'Thailand', currency: 'THB', currency_symbol: '฿', display_order: 5 },
];

// --- reference: top-15 banks per country -------------------------------------
// Per-country provider directory. category drives both the display grouping and
// the pricing tilt. 'fintech' entries are directory-only (see DIRECTORY_ONLY):
// they appear as a provider option but aren't put in the benchmark rate pool.
export const BANKS = {
  SG: [['DBS','local'],['POSB','local'],['OCBC','local'],['UOB','local'],['Standard Chartered','european'],['Citibank','foreign'],['HSBC','european'],['Maybank','foreign'],['Bank of China','foreign'],['CIMB','foreign'],['RHB','foreign'],['Trust Bank','digital'],['GXS Bank','digital'],['MariBank','digital'],['State Bank of India','indian']],

  // India — top public-sector, private, and fintechs
  IN: [
    ['State Bank of India','public'],['Punjab National Bank','public'],['Bank of Baroda','public'],['Canara Bank','public'],['Union Bank of India','public'],['Bank of India','public'],['Indian Bank','public'],['Central Bank of India','public'],['Indian Overseas Bank','public'],['UCO Bank','public'],
    ['HDFC Bank','private'],['ICICI Bank','private'],['Axis Bank','private'],['Kotak Mahindra Bank','private'],['IndusInd Bank','private'],['Yes Bank','private'],['IDFC First Bank','private'],['Federal Bank','private'],['RBL Bank','private'],['Bandhan Bank','private'],
    ['Paytm','fintech'],['PhonePe','fintech'],['Google Pay','fintech'],['Razorpay','fintech'],['CRED','fintech'],['BharatPe','fintech'],['Groww','fintech'],['Zerodha','fintech'],['Slice','fintech'],['Jupiter','fintech'],
    ['Standard Chartered','european'],['HSBC','european'],['Citibank','foreign'],['DBS Bank India','foreign'],
  ],

  // Malaysia — established banks + the new digital banks
  MY: [
    ['Maybank','local'],['CIMB','local'],['Public Bank','local'],['RHB','local'],['Hong Leong Bank','local'],['AmBank','local'],['Bank Islam','local'],['Affin Bank','local'],['Alliance Bank','local'],['Bank Rakyat','local'],
    ['GXBank','digital'],['Boost Bank','digital'],['AEON Bank','digital'],['KAF Digital Bank','digital'],['Ryt Bank','digital'],
    ['OCBC','foreign'],['UOB','foreign'],['Bank of China','foreign'],['Standard Chartered','european'],['HSBC','european'],
  ],

  // Indonesia — top banks + digital / neobanks
  ID: [
    ['Bank Mandiri','local'],['Bank Central Asia','local'],['Bank Rakyat Indonesia','local'],['Bank Negara Indonesia','local'],['Bank Tabungan Negara','local'],['CIMB Niaga','local'],['Bank Danamon','local'],['Panin Bank','local'],['OCBC NISP','local'],['Permata Bank','local'],
    ['Bank Jago','digital'],['SeaBank','digital'],['Allo Bank','digital'],['blu by BCA Digital','digital'],['Jenius (BTPN)','digital'],['Bank Neo Commerce','digital'],['LINE Bank','digital'],['TMRW by UOB','digital'],['Superbank','digital'],['Krom Bank','digital'],
    ['Maybank Indonesia','foreign'],['Standard Chartered','european'],['HSBC','european'],
  ],

  // Thailand — commercial banks + digital / virtual banks
  TH: [
    ['Bangkok Bank','local'],['Kasikornbank','local'],['Siam Commercial Bank','local'],['Krungthai Bank','local'],['Bank of Ayudhya','local'],['TMBThanachart','local'],['Kiatnakin Phatra','local'],['CIMB Thai','local'],['Government Savings Bank','local'],['UOB Thailand','foreign'],
    ['LINE BK','digital'],['Dime!','digital'],['SCBX Virtual Bank','digital'],['Krungthai-Gulf Virtual Bank','digital'],['TrueMoney','fintech'],
    ['Standard Chartered','european'],['HSBC','european'],['ICBC Thai','foreign'],
  ],
};
