/* Pick one of the illustrated expert avatars (lib/avatars.js). Used on the
 * advisor sign-up form and the advisor profile editor. `value` is the chosen
 * avatar's src; the caller decides what counts as the default. */
import './AvatarPicker.css';
import { AVATARS } from '../lib/avatars.js';

export default function AvatarPicker({ value, onChange, label = 'Your avatar' }) {
  return (
    <div className="avpick" role="radiogroup" aria-label={label}>
      {AVATARS.map((a) => {
        const on = a.src === value;
        return (
          <button
            type="button" key={a.id} role="radio" aria-checked={on}
            className={`avpick__opt${on ? ' is-on' : ''}`}
            onClick={() => onChange(a.src)}
            title={a.label}
          >
            <img src={a.src} alt="" width="64" height="64" loading="lazy" />
            <span>{a.label.replace(/^Ex-/, '')}</span>
          </button>
        );
      })}
    </div>
  );
}
