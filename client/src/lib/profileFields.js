// Single source of truth for the sign-up profile fields collected across the app
// (sign-up form, complete-profile prompt, admin viewer).

// Monthly-income brackets. `value` is stored in the DB, `label` is shown to users.
export const INCOME_BRACKETS = [
  { value: 'lt_5000', label: 'Up to $5,000' },
  { value: '5000_15000', label: '$5,000 – $15,000' },
  { value: '15000_30000', label: '$15,000 – $30,000' },
  { value: 'gt_30000', label: 'Over $30,000' },
];

export const INCOME_LABELS = Object.fromEntries(
  INCOME_BRACKETS.map((b) => [b.value, b.label])
);

// A profile is "complete" once we have the two fields the sign-up form asks for
// but OAuth (Google) sign-ups don't provide.
export const isProfileComplete = (p) => Boolean(p && p.phone && p.monthly_income);
