import { useState } from 'react';
import { safeHttpUrl } from '../lib/safeUrl.js';

function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20h4l10.5-10.5a2.121 2.121 0 0 0-3-3L5 17v3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M13.5 6.5l3 3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

const rawValue = (col, row) => (col.get ? col.get(row) : row[col.key]);

const displayValue = (col, row) => {
  const v = rawValue(col, row);
  if (col.type === 'boolean') return v ? 'Yes' : 'No';
  return v === null || v === undefined || v === '' ? '—' : String(v);
};

/* Generic table with per-row inline editing.
   columns: [{ key, label, type?: 'number'|'boolean'|'text', editable?, step?, get? }]
   onSave(row, patch) must persist and resolve; throws to surface an error. */
export default function EditableTable({ columns, rows, rowKey, onSave }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedKey, setSavedKey] = useState(null);
  const anyEditable = columns.some((c) => c.editable);

  const startEdit = (row) => {
    setError('');
    setSavedKey(null);
    setEditing(rowKey(row));
    const d = {};
    for (const c of columns) if (c.editable) d[c.key] = row[c.key];
    setDraft(d);
  };
  const cancel = () => { setEditing(null); setDraft({}); setError(''); };

  const setField = (col, raw) => {
    let value = raw;
    if (col.type === 'number') value = raw === '' ? null : Number(raw);
    if (col.type === 'boolean') value = raw;
    setDraft((d) => ({ ...d, [col.key]: value }));
  };

  const save = async (row) => {
    setBusy(true);
    setError('');
    try {
      const patch = {};
      for (const c of columns) if (c.editable) patch[c.key] = draft[c.key];
      await onSave(row, patch);
      setSavedKey(rowKey(row));
      setEditing(null);
      setDraft({});
    } catch (e) {
      setError(e.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="adm-tablewrap">
      {error && <div className="adm-error">{error}</div>}
      <table className="adm-table">
        <thead>
          <tr>
            {columns.map((c) => <th key={c.key}>{c.label}</th>)}
            {anyEditable && <th className="adm-actions-col">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const k = rowKey(row);
            const isEditing = editing === k;
            return (
              <tr key={k} className={savedKey === k ? 'adm-saved' : ''}>
                {columns.map((c) => (
                  <td key={c.key} data-label={c.label}>
                    {isEditing && c.editable ? (
                      c.type === 'boolean' ? (
                        <input type="checkbox" checked={!!draft[c.key]} onChange={(e) => setField(c, e.target.checked)} />
                      ) : (
                        <input
                          className="adm-input"
                          type={c.type === 'number' ? 'number' : 'text'}
                          step={c.step || (c.type === 'number' ? 'any' : undefined)}
                          value={draft[c.key] ?? ''}
                          onChange={(e) => setField(c, e.target.value)}
                        />
                      )
                    ) : c.type === 'link' ? (
                      safeHttpUrl(rawValue(c, row))
                        ? <a className="adm-val" href={safeHttpUrl(rawValue(c, row))} target="_blank" rel="noopener noreferrer">View</a>
                        : <span className="adm-val">—</span>
                    ) : (
                      <span className={c.editable ? 'adm-val adm-val--editable' : 'adm-val'}>
                        {displayValue(c, row)}
                      </span>
                    )}
                  </td>
                ))}
                {anyEditable && (
                <td className="adm-actions-col" data-label="Actions">
                  {isEditing ? (
                    <div className="adm-rowactions">
                      <button className="adm-btn adm-btn--save" disabled={busy} onClick={() => save(row)}>
                        {busy ? 'Saving…' : 'Save'}
                      </button>
                      <button className="adm-btn adm-btn--ghost" disabled={busy} onClick={cancel}>Cancel</button>
                    </div>
                  ) : (
                    <button className="adm-pencil" title="Edit" onClick={() => startEdit(row)}>
                      <PencilIcon />
                    </button>
                  )}
                </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
