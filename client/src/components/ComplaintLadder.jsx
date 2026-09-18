/* The complaint escalation ladder for one market, optionally narrowed to one bank.
 *
 * Shared deliberately: the customer sees this in their dashboard and the support
 * agent sees the identical thing in the support portal. Two renderings of an
 * escalation path would eventually disagree, and the one the agent reads out on
 * a call is the one that has to be right.
 *
 * Levels 1 and 2 are bank-specific and come from public.complaint_contacts,
 * which is empty until a human verifies a row. When there is no verified row we
 * say so and point at the bank's own grievance page — never at a guessed
 * address. Level 3 is the regulator and is market-wide (lib/complaints.js).
 */
import { useEffect, useState } from 'react';
import './ComplaintLadder.css';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { escalationFor, UNIVERSAL_TIPS } from '../lib/complaints.js';

const Contact = ({ label, value, href }) => {
  if (!value) return null;
  return (
    <div className="cmpl-contact">
      <span>{label}</span>
      {href ? <a href={href}>{value}</a> : <strong>{value}</strong>}
    </div>
  );
};

export default function ComplaintLadder({ country, bankId = null, bankName = null }) {
  const [rows, setRows] = useState(null);
  const esc = escalationFor(country);

  useEffect(() => {
    if (!bankId || !isSupabaseConfigured) { setRows([]); return undefined; }
    let alive = true;
    supabase
      .from('complaint_contacts')
      .select('*')
      .eq('bank_id', bankId)
      .order('level')
      .then(({ data }) => { if (alive) setRows(data || []); });
    return () => { alive = false; };
  }, [bankId]);

  if (!esc) {
    return <p className="cmpl-empty">We don’t have a complaint escalation path for this market yet.</p>;
  }

  const contactFor = (level) => (rows || []).find((r) => r.level === level) || null;

  return (
    <div className="cmpl">
      <ol className="cmpl-steps">
        {esc.steps.map((s) => {
          const c = s.level < 3 ? contactFor(s.level) : null;
          const reg = s.level === 3 ? esc.regulator : null;
          return (
            <li className={`cmpl-step cmpl-step--${s.level}`} key={s.level}>
              <div className="cmpl-step__num">{s.level}</div>
              <div className="cmpl-step__body">
                <h4>{s.title}</h4>
                <p className="cmpl-who">{s.who}</p>
                <p className="cmpl-how">{s.how}</p>

                {/* Levels 1-2: this bank's own people, if someone has verified them. */}
                {s.level < 3 && bankId && (
                  c ? (
                    <div className="cmpl-card">
                      <div className="cmpl-card__head">
                        <strong>{c.org_name}</strong>
                        {c.role_title && <span>{c.role_title}</span>}
                        {!c.verified_at && <span className="cmpl-flag">Unverified</span>}
                      </div>
                      <Contact label="Email" value={c.email} href={c.email ? `mailto:${c.email}` : null} />
                      <Contact label="Phone" value={c.phone} href={c.phone ? `tel:${c.phone.replace(/\s/g, '')}` : null} />
                      <Contact label="Page" value={c.page_url} href={c.page_url} />
                      {c.hours && <Contact label="Hours" value={c.hours} />}
                      {c.notes && <p className="cmpl-note">{c.notes}</p>}
                      {!c.verified_at && (
                        <p className="cmpl-note cmpl-note--warn">
                          Not yet confirmed against the bank’s published page. Check it before relying on it.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="cmpl-card cmpl-card--gap">
                      <p>
                        We don’t yet hold a confirmed contact for <strong>{bankName || 'this bank'}</strong> at
                        this step. Search “{bankName || 'your bank'} grievance redressal” on the bank’s own
                        website — the current officer, email and phone are published there, and we would
                        rather send you to the source than guess an address.
                      </p>
                    </div>
                  )
                )}

                {/* Level 3: the regulator. Market-wide and verified in code. */}
                {reg && (
                  <div className={`cmpl-card cmpl-card--reg${reg.verified ? '' : ' cmpl-card--unver'}`}>
                    <div className="cmpl-card__head">
                      <strong>{reg.name}</strong>
                      {!reg.verified && <span className="cmpl-flag">Unverified</span>}
                    </div>
                    <Contact label="File online" value={reg.portal} href={reg.portal} />
                    <Contact label="Phone" value={reg.phone} href={reg.phone ? `tel:${reg.phone.replace(/\s/g, '')}` : null} />
                    {reg.phoneNote && <p className="cmpl-note">{reg.phoneNote}</p>}
                    <Contact label="Email" value={reg.email} href={reg.email ? `mailto:${reg.email}` : null} />
                    {reg.emailNote && <p className="cmpl-note">{reg.emailNote}</p>}
                    {reg.address && <Contact label="Address" value={reg.address} />}
                    {reg.directory && <Contact label="Office directory" value={reg.directory} href={reg.directory} />}
                    {reg.note && <p className="cmpl-note">{reg.note}</p>}
                    {!reg.verified && (
                      <p className="cmpl-note cmpl-note--warn">{reg.unverifiedReason}</p>
                    )}
                    <p className="cmpl-src">
                      Read from <a href={reg.sourceUrl}>{reg.sourceUrl}</a> on {reg.checkedOn}.
                    </p>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className={`cmpl-deadline${esc.deadlines ? '' : ' cmpl-deadline--unknown'}`}>
        <h4>Deadlines</h4>
        <p>{esc.deadlines || esc.deadlinesNote}</p>
        {esc.scheme && (
          <p className="cmpl-src">
            {esc.scheme.name}. {esc.scheme.note}{' '}
            Read from <a href={esc.scheme.sourceUrl}>the scheme FAQ</a> on {esc.scheme.checkedOn}.
          </p>
        )}
      </div>

      <div className="cmpl-tips">
        <h4>Whatever the market</h4>
        <ul>{UNIVERSAL_TIPS.map((t) => <li key={t}>{t}</li>)}</ul>
      </div>
    </div>
  );
}
