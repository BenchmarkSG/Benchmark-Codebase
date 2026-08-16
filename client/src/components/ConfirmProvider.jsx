import { createContext, useCallback, useContext, useRef, useState } from 'react';
import './ConfirmProvider.css';
import { useModalA11y } from '../hooks/useModalA11y.js';

// App-wide confirmation dialog. Replaces silent one-click destructive actions
// (deletes, wipes, production writes) with an explicit, promise-based confirm:
//
//   const confirm = useConfirm();
//   if (await confirm({ title, body, confirmLabel, danger })) { …do it… }
//
// The dialog is focus-trapped and, being destructive, focuses "Cancel" by
// default (via useModalA11y) so a stray Enter never confirms.
const ConfirmCtx = createContext(() => Promise.resolve(false));
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolver = useRef(null);
  const cardRef = useRef(null);

  const confirm = useCallback(
    (opts = {}) =>
      new Promise((resolve) => {
        resolver.current = resolve;
        setState({
          title: opts.title || 'Are you sure?',
          body: opts.body || '',
          confirmLabel: opts.confirmLabel || 'Confirm',
          cancelLabel: opts.cancelLabel || 'Cancel',
          danger: opts.danger !== false,
        });
      }),
    [],
  );

  const settle = (val) => {
    resolver.current?.(val);
    resolver.current = null;
    setState(null);
  };

  useModalA11y(!!state, cardRef, () => settle(false));

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <div className="cfm" role="alertdialog" aria-modal="true" aria-labelledby="cfm-title" aria-describedby="cfm-body">
          <div className="cfm__overlay" onClick={() => settle(false)} />
          <div className="cfm__card" ref={cardRef}>
            <h3 className="cfm__title" id="cfm-title">{state.title}</h3>
            {state.body && <p className="cfm__body" id="cfm-body">{state.body}</p>}
            <div className="cfm__actions">
              <button type="button" className="cfm__btn cfm__btn--ghost" onClick={() => settle(false)}>
                {state.cancelLabel}
              </button>
              <button
                type="button"
                className={`cfm__btn ${state.danger ? 'cfm__btn--danger' : 'cfm__btn--primary'}`}
                onClick={() => settle(true)}
              >
                {state.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}
