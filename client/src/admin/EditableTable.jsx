import { Fragment, useState } from 'react';
import { safeHttpUrl } from '../lib/safeUrl.js';
import { formatDate } from '../lib/formatDate.js';

function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20h4l10.5-10.5a2.121 2.121 0 0 0-3-3L5 17v3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M13.5 6.5l3 3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

const rawValue = (col, row) => (col.get ? col.get(row) : row[col.key]);

// Dropdown choices for a 'select' column. A value already on the row that isn't
// in the list (legacy data, a value added straight in SQL) is kept at the top
// rather than dropped — otherwise opening the editor would silently rewrite it
// to whatever happened to be first.
function selectOptions(col, current) {
  const opts = (col.options || []).map((o) => (
    typeof o === 'string' ? { value: o, label: o } : { value: o.value, label: o.label ?? o.value }
  ));
  const has = opts.some((o) => o.value === current);
  return !has && current !== null && current !== undefined && current !== ''
    ? [{ value: current, label: `${current} (current)` }, ...opts]
    : opts;
}

const displayValue = (col, row) => {
  const v = rawValue(col, row);
  if (col.type === 'boolean') return v ? 'Yes' : 'No';
  return v === null || v === undefined || v === '' ? '—' : String(v);
};

// "Last verified" freshness pill: green ≤7d, amber ≤30d, red older, grey if never.
const DAY_MS = 86400000;
function freshnessDays(ts) {
  if (!ts) return null;
  const d = (Date.now() - new Date(ts).getTime()) / DAY_MS;
  return Number.isFinite(d) ? Math.floor(d) : null;
}
function FreshnessChip({ value }) {
  const days = freshnessDays(value);
  if (days == null) return <span className="adm-fresh adm-fresh--none">never</span>;
  const tone = days <= 7 ? 'ok' : days <= 30 ? 'warn' : 'stale';
  const label = days === 0 ? 'today' : days === 1 ? '1d ago' : `${days}d ago`;
  return <span className={`adm-fresh adm-fresh--${tone}`} title={value ? formatDate(value) : ''}>{label}</span>;
}

/* Generic table with per-row inline editing.
   columns: [{ key, label, type?: 'number'|'boolean'|'text'|'select', editable?, step?, get?, options? }]
   'select' renders a dropdown from `options` — plain strings, or { value, label }.
   onSave(row, patch) must persist and resolve; throws to surface an error. */
export default function EditableTable({ columns, rows, rowKey, onSave, onVerify, emptyLabel = 'Nothing to show yet.' }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});
  const [busyKey, setBusyKey] = useState(null); // per-row, so one save doesn't disable every row
  const [err, setErr] = useState(null);         // { key, msg } — shown next to the acting row
  const [savedKey, setSavedKey] = useState(null);
  const anyEditable = columns.some((c) => c.editable);
  const showActions = anyEditable || !!onVerify;
  const span = columns.length + (showActions ? 1 : 0);

  const startEdit = (row) => {
    setErr(null);
    setSavedKey(null);
    setEditing(rowKey(row));
    const d = {};
    for (const c of columns) if (c.editable) d[c.key] = row[c.key];
    setDraft(d);
  };
  const cancel = () => { setEditing(null); setDraft({}); setErr(null); };

  const setField = (col, raw) => {
    let value = raw;
    if (col.type === 'number') value = raw === '' ? null : Number(raw);
    if (col.type === 'boolean') value = raw;
    setDraft((d) => ({ ...d, [col.key]: value }));
  };

  // Confirmation highlight clears itself so "just saved" and "saved a while ago"
  // never look the same.
  const flashSaved = (k) => { setSavedKey(k); setTimeout(() => setSavedKey((cur) => (cur === k ? null : cur)), 2500); };

  const save = async (row) => {
    const k = rowKey(row);
    setBusyKey(k); setErr(null);
    try {
      const patch = {};
      for (const c of columns) if (c.editable) patch[c.key] = draft[c.key];
      await onSave(row, patch);
      flashSaved(k);
      setEditing(null);
      setDraft({});
    } catch (e) {
      setErr({ key: k, msg: e.message || 'Save failed — please try again.' });
    } finally {
      setBusyKey(null);
    }
  };

  // "Verify" = confirm a rate is still current without changing it.
  const verify = async (row) => {
    const k = rowKey(row);
    setBusyKey(k); setErr(null);
    try {
      await onVerify(row);
      flashSaved(k);
    } catch (e) {
      setErr({ key: k, msg: e.message || 'Verify failed — please try again.' });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="adm-tablewrap">
      <table className="adm-table">
        <thead>
          <tr>
            {columns.map((c) => <th key={c.key} scope="col">{c.label}</th>)}
            {showActions && <th className="adm-actions-col" scope="col">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td className="adm-emptyrow" colSpan={span}>{emptyLabel}</td></tr>
          )}
          {rows.map((row) => {
            const k = rowKey(row);
            const isEditing = editing === k;
            const rowBusy = busyKey === k;
            return (
              <Fragment key={k}>
                <tr className={savedKey === k ? 'adm-saved' : ''}>
                  {columns.map((c) => (
                    <td key={c.key} data-label={c.label}>
                      {isEditing && c.editable ? (
                        c.type === 'boolean' ? (
                          <input type="checkbox" aria-label={c.label} checked={!!draft[c.key]} onChange={(e) => setField(c, e.target.checked)} />
                        ) : c.type === 'select' ? (
                          <select
                            className="adm-input"
                            aria-label={c.label}
                            value={draft[c.key] ?? ''}
                            onChange={(e) => setField(c, e.target.value)}
                          >
                            {selectOptions(c, draft[c.key]).map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className="adm-input"
                            aria-label={c.label}
                            type={c.type === 'number' ? 'number' : 'text'}
                            step={c.step || (c.type === 'number' ? 'any' : undefined)}
                            value={draft[c.key] ?? ''}
                            onChange={(e) => setField(c, e.target.value)}
                          />
                        )
                      ) : c.type === 'freshness' ? (
                        <FreshnessChip value={rawValue(c, row)} />
                      ) : c.type === 'link' ? (
                        safeHttpUrl(rawValue(c, row))
                          ? <a className="adm-val" href={safeHttpUrl(rawValue(c, row))} target="_blank" rel="noopener noreferrer">View</a>
                          : <span className="adm-val">—</span>
                      ) : c.editable ? (
                        <button type="button" className="adm-val adm-val--editable" onClick={() => startEdit(row)} title="Click to edit">
                          {displayValue(c, row)}
                        </button>
                      ) : (
                        <span className="adm-val">{displayValue(c, row)}</span>
                      )}
                    </td>
                  ))}
                  {showActions && (
                  <td className="adm-actions-col" data-label="Actions">
                    {isEditing ? (
                      <div className="adm-rowactions">
                        <button className="adm-btn adm-btn--save" disabled={rowBusy} onClick={() => save(row)}>
                          {rowBusy ? 'Saving…' : 'Save'}
                        </button>
                        <button className="adm-btn adm-btn--ghost" disabled={rowBusy} onClick={cancel}>Cancel</button>
                      </div>
                    ) : (
                      <div className="adm-rowactions">
                        {onVerify && (
                          <button className="adm-btn adm-btn--verify" disabled={rowBusy} onClick={() => verify(row)} title="Confirm this rate is still current (updates its last-verified date)">
                            {rowBusy ? '…' : '✓ Verify'}
                          </button>
                        )}
                        {anyEditable && (
                          <button className="adm-pencil" title="Edit" aria-label="Edit row" disabled={rowBusy} onClick={() => startEdit(row)}>
                            <PencilIcon />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  )}
                </tr>
                {err?.key === k && (
                  <tr className="adm-errorrow"><td colSpan={span} role="alert">⚠ {err.msg}</td></tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
