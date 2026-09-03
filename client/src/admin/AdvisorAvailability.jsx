import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import {
  listAdvisorBlackouts, createAdvisorBlackout, deleteAdvisorBlackout,
} from '../lib/dashboardApi.js';

// Blocking an advisor's availability. IMPORTANT: this records the window on our
// side and shows it in our booking flow — it does NOT reach into Calendly.
// Calendly's API has no endpoint for availability overrides, so the advisor must
// also add the date override in Calendly (or connect their real calendar), or
// the slot stays bookable inside the embedded widget. The banner below says so
// in the UI, because an admin who assumes otherwise will get double-booked.

const todayISO = () => new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD

const fmtDate = (iso) => {
  const [y, m, d] = (iso || '').split('-').map(Number);
  if (!y) return iso || '';
  // Constructed as local, not parsed from the string — `new Date('2026-09-12')`
  // is UTC midnight and renders as the 11th anywhere west of Greenwich.
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
};

const fmtTime = (t) => (t || '').slice(0, 5);

const describe = (row) => (row.start_time
  ? `${fmtTime(row.start_time)} – ${fmtTime(row.end_time)}`
  : 'All day');

const blankForm = () => ({
  block_date: todayISO(), all_day: true, start_time: '09:00', end_time: '12:00', reason: '',
});

export default function AdvisorAvailability() {
  const [advisors, setAdvisors] = useState(null);
  const [advisorId, setAdvisorId] = useState('');
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    supabase.from('advisors')
      .select('id, full_name, email, company, status')
      .eq('status', 'approved')
      .order('full_name')
      .then(({ data, error: err }) => {
        if (err) { setError(err.message); setAdvisors([]); return; }
        setAdvisors(data || []);
        if (data?.length) setAdvisorId((cur) => cur || data[0].id);
      });
  }, []);

  const load = useCallback(async (id) => {
    if (!id) { setRows([]); return; }
    setRows(null);
    try { setRows(await listAdvisorBlackouts(id)); }
    catch (err) { setError(err.message); setRows([]); }
  }, []);

  useEffect(() => { load(advisorId); }, [advisorId, load]);

  const selected = useMemo(
    () => (advisors || []).find((a) => a.id === advisorId) || null,
    [advisors, advisorId],
  );

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  const add = async (e) => {
    e.preventDefault();
    setError(''); setNotice('');
    if (!advisorId) { setError('Pick an advisor first.'); return; }
    if (!form.block_date) { setError('Pick a date to block.'); return; }
    if (!form.all_day && !(form.start_time < form.end_time)) {
      setError('The end time has to be after the start time.');
      return;
    }
    setBusy(true);
    try {
      await createAdvisorBlackout({
        advisor_id: advisorId,
        block_date: form.block_date,
        start_time: form.all_day ? null : form.start_time,
        end_time: form.all_day ? null : form.end_time,
        reason: form.reason.trim() || null,
      });
      setForm((f) => ({ ...blankForm(), block_date: f.block_date })); // same day, next slot
      setNotice('Blocked. Remember to mirror this in Calendly.');
      await load(advisorId);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row) => {
    setError(''); setNotice('');
    setRows((rs) => rs.filter((r) => r.id !== row.id)); // optimistic
    try { await deleteAdvisorBlackout(row.id); }
    catch (err) { setError(err.message); load(advisorId); }
  };

  const today = todayISO();
  const upcoming = (rows || []).filter((r) => r.block_date >= today);
  const past = (rows || []).filter((r) => r.block_date < today);

  return (
    <div className="adm-avail">
      <p className="adm-avail__warn">
        <strong>This blocks the slot in FeeOptima only.</strong> Calendly gives us no way to
        write availability from here, so the advisor still has to add the same date override in
        Calendly — otherwise the slot stays bookable in the scheduling widget. What this does is
        mark the window as unavailable in our booking flow and keep the record here.
      </p>

      <label className="adm-country adm-avail__pick">
        Advisor
        <select value={advisorId} onChange={(e) => setAdvisorId(e.target.value)} disabled={!advisors?.length}>
          {advisors === null && <option>Loading…</option>}
          {advisors?.length === 0 && <option value="">No approved advisors yet</option>}
          {(advisors || []).map((a) => (
            <option key={a.id} value={a.id}>{a.full_name}{a.company ? ` · ${a.company}` : ''}</option>
          ))}
        </select>
      </label>

      {advisorId && (
        <form className="adm-avail__form" onSubmit={add}>
          <label className="adm-avail__field">
            <span>Date</span>
            <input type="date" value={form.block_date} min={today} onChange={set('block_date')} required />
          </label>

          <label className="adm-avail__check">
            <input type="checkbox" checked={form.all_day} onChange={set('all_day')} />
            <span>Block the whole day</span>
          </label>

          {!form.all_day && (
            <>
              <label className="adm-avail__field">
                <span>From</span>
                <input type="time" value={form.start_time} onChange={set('start_time')} required />
              </label>
              <label className="adm-avail__field">
                <span>To</span>
                <input type="time" value={form.end_time} onChange={set('end_time')} required />
              </label>
            </>
          )}

          <label className="adm-avail__field adm-avail__field--grow">
            <span>Reason <em>(internal)</em></span>
            <input
              type="text" value={form.reason} onChange={set('reason')} maxLength={140}
              placeholder="Annual leave, client offsite…"
            />
          </label>

          <button className="adm-btn adm-btn--save" disabled={busy}>
            {busy ? 'Blocking…' : 'Block this time'}
          </button>
        </form>
      )}

      {error && <p className="adm-avail__error">{error}</p>}
      {notice && <p className="adm-avail__notice">{notice}</p>}

      <div className="adm-tablewrap">
        <table className="adm-table">
          <thead>
            <tr><th>Date</th><th>When</th><th>Reason</th><th /></tr>
          </thead>
          <tbody>
            {rows === null && <tr><td className="adm-emptyrow" colSpan={4}>Loading…</td></tr>}
            {rows?.length === 0 && (
              <tr><td className="adm-emptyrow" colSpan={4}>
                {selected ? `${selected.full_name} has no blocked time.` : 'Pick an advisor above.'}
              </td></tr>
            )}
            {upcoming.map((r) => (
              <tr key={r.id}>
                <td>{fmtDate(r.block_date)}</td>
                <td>{describe(r)}</td>
                <td>{r.reason || <span className="adm-avail__muted">—</span>}</td>
                <td>
                  <button className="adm-btn adm-btn--ghost" onClick={() => remove(r)}>Unblock</button>
                </td>
              </tr>
            ))}
            {past.length > 0 && (
              <tr className="adm-avail__sep">
                <td colSpan={4}>Past — kept for the record</td>
              </tr>
            )}
            {past.map((r) => (
              <tr key={r.id} className="adm-avail__past">
                <td>{fmtDate(r.block_date)}</td>
                <td>{describe(r)}</td>
                <td>{r.reason || <span className="adm-avail__muted">—</span>}</td>
                <td>
                  <button className="adm-btn adm-btn--ghost" onClick={() => remove(r)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
