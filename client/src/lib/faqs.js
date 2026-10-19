/* Every FAQ in one place: the landing page's FAQ section shows them all, and
 * the booking confirmation screens show the call or expert ones. Edit here so
 * the two never disagree. */

export const GENERAL_FAQ = [
  {
    q: 'Is it really free?',
    a: 'Benchmarking your rates, fees and FX margins is completely free with no sign-up. Revealing your best-match bank costs a small one-off fee — and drafting your negotiation email is then included. If you want hands-on help, a coaching call and an expert-led negotiation are also available. Every price is shown in your local currency before you pay, and the paid help is fully refundable if we don’t find you savings.',
  },
  {
    q: 'Do you store my bank statements or personal data?',
    a: 'No. We don’t keep personal or account-identifying data. When you paste or upload transaction data we process it to benchmark and keep only anonymised metrics (fees, margins, volumes). Please mask beneficiary names and references before sharing.',
  },
  {
    q: 'How does the expert negotiation work?',
    a: 'An ex-banker contacts your bank armed with your specific benchmarking data and negotiates on your behalf. The fee is fully refundable if no savings are delivered — so there’s no risk in trying.',
  },
];

const NOT_SATISFIED = {
  q: 'What if I’m not satisfied?',
  a: 'You get a 100% refund. Just message us on WhatsApp.',
};

// Option 2 — the coaching call.
export const CALL_FAQ = [
  {
    q: 'What will I do in the call?',
    a: 'A FeeOptima specialist walks through your benchmark with you — where your bank sits against the market, what rate to ask for, and exactly what to say to your bank.',
  },
  {
    q: 'What should I have ready?',
    a: 'Your latest statement or letter for this product, and your bank contact (relationship manager or branch). We already have your benchmark.',
  },
  NOT_SATISFIED,
];

// Option 3 — the expert-led negotiation.
export const EXPERT_FAQ = [
  {
    q: 'What happens after I book an expert?',
    a: 'Your expert will reach out on WhatsApp to plan the negotiation with you — your numbers, your bank, and what to ask for.',
  },
  {
    q: 'Will the expert talk to my bank for me?',
    a: 'Yes. Once you have planned it together and you give the go-ahead, they lead the negotiation with your bank on your behalf.',
  },
  NOT_SATISFIED,
];

/** The landing page's list: general first, then the booking ones, no repeats. */
export const ALL_FAQ = [...GENERAL_FAQ, ...CALL_FAQ, ...EXPERT_FAQ]
  .filter((f, i, list) => list.findIndex((x) => x.q === f.q) === i);
