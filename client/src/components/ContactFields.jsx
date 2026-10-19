/* "Your Contact Details" on its own — WhatsApp number (dial code + number) and
 * email — for screens that collect contact details without a time slot
 * (Option 3: the expert contacts the customer, so there is no slot to pick).
 * Same look as the block inside SlotPicker. Reports the full number and whether
 * the pair is usable; saving the number is the caller's job, at pay time.
 */
import { useEffect, useId, useState } from 'react';
import './SlotPicker.css';
import DialCodeField from './DialCodeField.jsx';
import { splitPhone, fullNumber, EMAIL_RE } from './SlotPicker.jsx';
import { looksDialable, missingCountryCode } from '../lib/whatsapp.js';

export default function ContactFields({ phone = '', email = '', onEmailChange, country = 'SG', disabled = false, onChange, onDone }) {
  const [dialCode, setDialCode] = useState(() => splitPhone(phone, country).code);
  const [num, setNum] = useState(() => splitPhone(phone, country).rest);
  const telId = useId();

  // A number that arrives later (the profile loads after first render).
  useEffect(() => {
    if (!phone) return;
    const p = splitPhone(phone, country);
    setDialCode(p.code); setNum(p.rest);
  }, [phone, country]);

  const full = fullNumber(dialCode, num);
  const valid = looksDialable(full) && !missingCountryCode(dialCode) && EMAIL_RE.test(String(email || '').trim());
  useEffect(() => { onChange?.({ phone: full, valid }); }, [full, valid]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="slots">
      <div className="slots__sec">
        <h5 className="slots__title">Your Contact Details</h5>
        <div className="slots__contact">
          <div className="slots__field">
            <label htmlFor={telId}>WhatsApp number <i aria-hidden="true">*</i></label>
            <span className="slots__telrow">
              <DialCodeField value={dialCode} onChange={setDialCode} onBlur={() => onDone?.()} disabled={disabled} />
              <input
                id={telId} type="tel" value={num}
                onChange={(e) => setNum(e.target.value)} onBlur={() => onDone?.()}
                placeholder="9123 4567" autoComplete="tel-national" inputMode="tel"
                aria-label="WhatsApp number" required disabled={disabled}
              />
            </span>
          </div>
          <label className="slots__field">
            <span>Email <i aria-hidden="true">*</i></span>
            <input
              type="email" value={email}
              readOnly={!onEmailChange}
              onChange={onEmailChange ? (e) => onEmailChange(e.target.value) : undefined}
              onBlur={() => onDone?.()}
              placeholder="you@example.com" autoComplete="email" inputMode="email"
              aria-label="Email" required disabled={!!onEmailChange && disabled}
            />
          </label>
        </div>
        {missingCountryCode(dialCode) && (
          <p className="slots__hint">Start the code with +, e.g. +65 or +91 — WhatsApp needs it.</p>
        )}
      </div>
    </div>
  );
}
