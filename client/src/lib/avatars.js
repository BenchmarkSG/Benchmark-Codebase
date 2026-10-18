/* The illustrated expert avatars (public/avatars). Advisors pick one when they
 * sign up; it is stored in advisors.photo_url as its /avatars/… path.
 *
 * Every expert on screen shows one of these. An advisor whose photo_url isn't
 * one of them — an older upload, or nothing at all — gets the avatar that
 * matches their specialisation, so the directory always looks like one set.
 */
export const AVATARS = [
  { id: 'retail-banker',        label: 'Ex-Retail Banker',        src: '/avatars/retail-banker.webp' },
  { id: 'transaction-banker',   label: 'Ex-Transaction Banker',   src: '/avatars/transaction-banker.webp' },
  { id: 'trade-finance-banker', label: 'Ex-Trade Finance Banker', src: '/avatars/trade-finance-banker.webp' },
  { id: 'investment-banker',    label: 'Ex-Investment Banker',    src: '/avatars/investment-banker.webp' },
  { id: 'credit-analyst',       label: 'Ex-Credit Analyst',       src: '/avatars/credit-analyst.webp' },
  { id: 'mortgage-banker',      label: 'Ex-Mortgage Banker',      src: '/avatars/mortgage-banker.webp' },
  { id: 'corporate-treasurer',  label: 'Ex-Corporate Treasurer',  src: '/avatars/corporate-treasurer.webp' },
];

const BY_SRC = new Map(AVATARS.map((a) => [a.src, a]));
const BY_ID = new Map(AVATARS.map((a) => [a.id, a]));

// Specialisation (or role) text → the avatar that fits it. First match wins.
const RULES = [
  [/mortgage|housing|home loan|property/i, 'mortgage-banker'],
  [/trade/i, 'trade-finance-banker'],
  [/cash management|transaction|payment/i, 'transaction-banker'],
  [/treasury|fx|foreign exchange|liquidity/i, 'corporate-treasurer'],
  [/private banking|wealth|investment/i, 'investment-banker'],
  [/credit|lending|loan|corporate finance/i, 'credit-analyst'],
  [/retail|consumer|sme/i, 'retail-banker'],
];

/** The avatar for a specialisation, or null when nothing matches. */
export function avatarForSpecialization(text = '') {
  const hit = RULES.find(([re]) => re.test(text || ''));
  return hit ? BY_ID.get(hit[1]) : null;
}

/** Is this photo_url one of the set? */
export const isAvatar = (url) => BY_SRC.has(url || '');

/**
 * The avatar src to show for an expert: their chosen one, else the one for
 * their specialisation, else a stable pick from the set by id/name.
 */
export function expertAvatar({ photo_url, specialization, role, id, name } = {}) {
  if (isAvatar(photo_url)) return photo_url;
  const bySpec = avatarForSpecialization(`${specialization || ''} ${role || ''}`);
  if (bySpec) return bySpec.src;
  const key = String(id || name || '');
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AVATARS[h % AVATARS.length].src;
}
