/* Turning a saved benchmark's raw `inputs` blob into labelled rows for the
   support queue.
 *
 * Pure and dependency-free on purpose: the agent's whole picture of the customer
 * comes from here, and a field that silently fails to render is invisible in a
 * screenshot but very visible on a call. Kept out of the component so it can be
 * exercised against the real product catalog.
 *
 * Labels, types and enum options all come from the catalog, so a new product
 * shows up correctly without this file knowing it exists.
 */

export function money(n, ccy) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency', currency: ccy || 'SGD', maximumFractionDigits: 0,
    }).format(Number(n));
  } catch {
    // An unknown/!ISO currency code throws rather than degrading.
    return `${ccy || ''} ${Math.round(Number(n)).toLocaleString()}`.trim();
  }
}

/** Every answer the customer actually gave, in the catalog's own order. */
export function inputRows(product, inputs, ccy) {
  if (!product?.inputs || !inputs) return [];
  const out = [];
  for (const field of product.inputs) {
    const raw = inputs[field.key];
    if (raw === null || raw === undefined || raw === '') continue;
    let value = String(raw);

    if (field.type === 'enum') {
      // "floating" is meaningless to read aloud; "Floating" is the label.
      value = field.options?.find((o) => String(o.value) === String(raw))?.label || value;
    } else if (field.type === 'amount') {
      const n = Number(raw);
      // A transfer's sent/received legs are each in their OWN currency, not the
      // benchmark's — showing both in the row currency would misstate one side.
      const amtCcy = field.key === 'sent_amount' ? inputs.send_currency
        : field.key === 'received_amount' ? inputs.receive_currency
          : ccy;
      value = Number.isFinite(n) ? (money(n, amtCcy) ?? n.toLocaleString()) : value;
    } else if (field.type === 'rate') {
      value = `${raw}${field.unit ? ` ${field.unit}` : ' %'}`;
    } else if (field.type === 'tenor') {
      const n = Number(raw);
      value = Number.isFinite(n) ? `${n} months` : value;
    } else if (field.type === 'duration') {
      value = `${raw} hours`;
    }
    out.push({ key: field.key, label: field.label, value });
  }
  return out;
}

/**
 * Rank a lead for the queue, biggest saving first.
 *
 * Savings arrive in five currencies. Sorting the raw numbers would put the
 * large-denomination markets on top regardless of what the money is worth — an
 * IDR saving is a number roughly 14,000x an equivalent SGD one. `fx` maps a
 * currency to its rate into SGD; a currency we have no rate for sorts last
 * rather than pretending its raw number compares.
 *
 * Used for ORDERING ONLY. Every figure on screen stays in the customer's own
 * currency.
 */
export function rankSaving(lead, fx = {}) {
  const n = Number(lead?.annual_saving);
  if (!Number.isFinite(n)) return -1;
  const ccy = lead?.saved_benchmarks?.currency;
  if (!ccy || ccy === 'SGD') return n;
  const rate = fx[ccy];
  return Number.isFinite(rate) && rate > 0 ? n * rate : -1;
}
