/* The country-code dropdown of the WhatsApp number: the flag and the code on
 * the button, and a list of countries (flag, name, code) to pick from.
 *
 * Custom, not a native <select>: a <select>'s options can't show an image, and
 * SVG flags are the only kind that render everywhere — Windows shows flag
 * emoji as two letters ("IN"). Only the flags imported here are bundled.
 *
 * A stored code that isn't in the list (someone saved +34 before this
 * existed) is kept and shown with a globe, rather than silently replaced.
 */
import { useEffect, useRef, useState } from 'react';
import {
  SG, IN, MY, ID, TH, PH, VN, HK, CN, JP, KR, AU, NZ, AE, SA, QA, GB, US, DE, FR,
} from 'country-flag-icons/react/3x2';

// The markets first, then the rest. +1 is listed as the US (Canada shares it).
const COUNTRIES = [
  { code: '+65', name: 'Singapore', Flag: SG },
  { code: '+91', name: 'India', Flag: IN },
  { code: '+60', name: 'Malaysia', Flag: MY },
  { code: '+62', name: 'Indonesia', Flag: ID },
  { code: '+66', name: 'Thailand', Flag: TH },
  { code: '+61', name: 'Australia', Flag: AU },
  { code: '+86', name: 'China', Flag: CN },
  { code: '+33', name: 'France', Flag: FR },
  { code: '+49', name: 'Germany', Flag: DE },
  { code: '+852', name: 'Hong Kong', Flag: HK },
  { code: '+81', name: 'Japan', Flag: JP },
  { code: '+64', name: 'New Zealand', Flag: NZ },
  { code: '+63', name: 'Philippines', Flag: PH },
  { code: '+974', name: 'Qatar', Flag: QA },
  { code: '+966', name: 'Saudi Arabia', Flag: SA },
  { code: '+82', name: 'South Korea', Flag: KR },
  { code: '+971', name: 'United Arab Emirates', Flag: AE },
  { code: '+44', name: 'United Kingdom', Flag: GB },
  { code: '+1', name: 'United States', Flag: US },
  { code: '+84', name: 'Vietnam', Flag: VN },
];

const norm = (code) => `+${String(code || '').replace(/\D/g, '')}`;
export const countryFor = (code) => COUNTRIES.find((c) => c.code === norm(code)) || null;

function Globe() {
  return (
    <svg className="slots__globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
    </svg>
  );
}

export default function DialCodeField({ value, onChange, onBlur, disabled }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const listRef = useRef(null);

  const current = countryFor(value);
  // An unlisted stored code stays selectable at the top of the list.
  const options = current || !value ? COUNTRIES
    : [{ code: norm(value), name: 'Other', Flag: null }, ...COUNTRIES];
  const selectedIdx = Math.max(0, options.findIndex((c) => c.code === norm(value)));

  // Click outside closes it.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Keep the highlighted row in view while arrowing through the list.
  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const show = () => { setActive(selectedIdx); setOpen(true); };
  const pick = (c) => {
    onChange(c.code);
    setOpen(false);
    btnRef.current?.focus();
  };

  const onKeyDown = (e) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(options.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(options[active]); }
    else if (e.key === 'Escape' || e.key === 'Tab') {
      // Escape inside the booking modal would otherwise close the modal too.
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); }
      setOpen(false);
    } else if (/^[a-z]$/i.test(e.key)) {
      // Type a letter to jump to the first country starting with it.
      const i = options.findIndex((c) => c.name.toLowerCase().startsWith(e.key.toLowerCase()));
      if (i >= 0) setActive(i);
    }
  };

  const Flag = current?.Flag;
  return (
    <span className="slots__dialwrap" ref={wrapRef}>
      <button
        type="button" ref={btnRef}
        className={`slots__dial${open ? ' is-open' : ''}`}
        aria-haspopup="listbox" aria-expanded={open}
        aria-label={`Country code: ${current ? `${current.name} ${current.code}` : value || 'not set'}`}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        // Leaving the field is what SlotPicker listens for to take the hold;
        // a blur into the list itself is not leaving.
        onBlur={(e) => { if (!wrapRef.current?.contains(e.relatedTarget)) onBlur?.(); }}
      >
        <span className="slots__flag">{Flag ? <Flag title={current.name} /> : <Globe />}</span>
        <span className="slots__dialcode">{value ? norm(value) : '+'}</span>
        <svg className="slots__caret" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 4.5 L6 7.5 L9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul className="slots__dialmenu" role="listbox" ref={listRef} aria-label="Country code" tabIndex={-1}>
          {options.map((c, i) => (
            <li
              key={c.code}
              role="option"
              aria-selected={i === selectedIdx}
              className={`slots__dialopt${i === active ? ' is-active' : ''}${i === selectedIdx ? ' is-on' : ''}`}
              onMouseEnter={() => setActive(i)}
              // mousedown, not click: picking must not blur the button first.
              onMouseDown={(e) => { e.preventDefault(); pick(c); }}
            >
              <span className="slots__flag">{c.Flag ? <c.Flag /> : <Globe />}</span>
              <span className="slots__dialname">{c.name}</span>
              <span className="slots__dialnum">{c.code}</span>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
