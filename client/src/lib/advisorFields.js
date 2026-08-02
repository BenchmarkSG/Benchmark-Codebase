// Options for the "Become a Founding Member" advisor application form.

// Who the advisor serves (segment specialization).
export const ADVISOR_SEGMENTS = [
  { value: 'individual', label: 'Individual' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'both', label: 'Both' },
];

// Products the advisor can help with (multi-select).
export const ADVISOR_PRODUCTS = [
  'Mortgages & home loans',
  'Personal & consumer loans',
  'Savings & deposits',
  'Overdraft & working capital',
  'Short-term / trade loans',
  'Letters of credit (import/export)',
  'FX & cross-border payments',
  'Cash management',
  'Treasury & investments',
];

// Area of expertise (single-select dropdown).
export const ADVISOR_SPECIALIZATIONS = [
  'Cash management',
  'Trade finance',
  'Retail banking',
  'Private banking',
  'Treasury advisory',
  'Corporate finance',
  'Technical advisory',
];

// Human label for a `serves` code (used in the admin view).
export const SERVES_LABELS = Object.fromEntries(
  ADVISOR_SEGMENTS.map((s) => [s.value, s.label])
);
