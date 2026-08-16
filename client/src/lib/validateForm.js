// Drives our styled in-page form errors instead of the browser's native tooltip
// bubbles, so every form gives the same, consistent feedback. Add `noValidate`
// to the <form>, then on submit call firstInvalidField(formEl) and, if it returns
// a control, focus it and show one styled message.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function firstInvalidField(formEl) {
  if (!formEl) return null;
  for (const c of formEl.querySelectorAll('input, select, textarea')) {
    if (c.disabled || c.type === 'hidden') continue;
    if (c.type === 'checkbox') { if (c.required && !c.checked) return c; continue; }
    const val = String(c.value ?? '').trim();
    if (c.required && !val) return c;
    if (c.type === 'email' && val && !EMAIL_RE.test(val)) return c;
    if (c.minLength > 0 && val && val.length < c.minLength) return c;
  }
  return null;
}

// A human label for a control, from its wrapping <label><span>…</span></label>.
export function labelFor(el) {
  if (!el) return 'This field';
  const span = el.closest('label')?.querySelector('span');
  return (span?.textContent || el.getAttribute('aria-label') || el.name || 'This field')
    .replace(/\s*\*\s*$/, '')
    .replace(/\s*\(optional\)\s*$/i, '')
    .trim();
}

// One message for the first problem found, tailored to the failure type.
export function validationMessage(el) {
  if (!el) return '';
  const name = labelFor(el);
  if (el.type === 'checkbox') return `Please tick “${name}” to continue.`;
  if (el.type === 'email' && String(el.value).trim()) return 'Please enter a valid email address.';
  if (el.minLength > 0 && String(el.value).length < el.minLength) return `${name} must be at least ${el.minLength} characters.`;
  return `Please fill in ${name}.`;
}
