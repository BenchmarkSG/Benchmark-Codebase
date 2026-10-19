import { useEffect, useRef } from 'react';

// One place for correct modal behaviour: body scroll-lock, Escape-to-close,
// autofocus into the dialog, a Tab focus-trap, and focus restoration on close.
// Every modal in the app uses this so keyboard / screen-reader users are never
// stranded behind an overlay.
//
//   useModalA11y(open, cardRef, onRequestClose)
//
// - open:            boolean — is the dialog mounted/visible right now
// - cardRef:         ref to the dialog card element (the focus container)
// - onRequestClose:  called when the user presses Escape

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Module-level stack of open modals so that when dialogs nest (e.g. a confirm on
// top of a modal), only the topmost one traps focus and handles Escape — the
// ones beneath stay inert until it closes.
const stack = [];

export function useModalA11y(open, cardRef, onRequestClose) {
  const closeRef = useRef(onRequestClose);
  closeRef.current = onRequestClose;

  useEffect(() => {
    if (!open) return undefined;
    const card = cardRef.current;
    const token = {};
    stack.push(token);
    const isTop = () => stack[stack.length - 1] === token;
    const prevFocus = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus into the dialog — prefer the first field, else the first control.
    const field = card?.querySelector(
      'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])',
    );
    const target = field || card?.querySelector(FOCUSABLE) || card;
    // Defer so the element is laid out (autofocus after paint).
    const raf = requestAnimationFrame(() => { try { target?.focus(); } catch { /* ignore */ } });

    const onKey = (e) => {
      if (!isTop()) return; // only the topmost modal reacts to keys
      if (e.key === 'Escape') {
        // An open dropdown inside the modal (the country-code picker) takes
        // Escape for itself: it closes the list, not the whole modal.
        if (e.target?.closest?.('[aria-haspopup="listbox"][aria-expanded="true"]')) return;
        e.stopPropagation(); closeRef.current?.(); return;
      }
      if (e.key !== 'Tab' || !card) return;
      const nodes = Array.from(card.querySelectorAll(FOCUSABLE)).filter((n) => n.offsetParent !== null);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!card.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);

    return () => {
      cancelAnimationFrame(raf);
      const i = stack.indexOf(token);
      if (i >= 0) stack.splice(i, 1);
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      if (prevFocus && typeof prevFocus.focus === 'function') { try { prevFocus.focus(); } catch { /* ignore */ } }
    };
  }, [open, cardRef]);
}
