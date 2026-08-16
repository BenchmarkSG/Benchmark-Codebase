// One date formatter for the whole app so dates never render ambiguously
// (browser-locale toLocaleDateString gives MM/DD to some users, DD/MM to others).
// We use an explicit "11 Aug 2026" style — unambiguous for our SG audience.
const FMT = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export function formatDate(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return FMT.format(d);
}
