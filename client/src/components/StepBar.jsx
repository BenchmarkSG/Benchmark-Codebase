/* -----------------------------------------------------------------------------
 * FeeOptima — the five-step progress bar
 *
 * WHY
 *   The funnel spans several screens that don't look like a sequence: a form, a
 *   result, a Stripe redirect, then a modal. People who paid the ~$1 reveal had
 *   no way to tell how much further there was to go, and "Unlock" reads very
 *   differently when you can see it's step 4 of 5 rather than an open-ended ask.
 *
 * WHICH SCREEN IS WHICH STEP
 *   input      the calculator form
 *   compare    computing, and the free result: "you're losing $X a year" plus
 *              the rate comparison. One screen, one step.
 *   unlock     the reveal has been paid for (the result card knows this from
 *              unlockedTierFor(), so the bar advances without a round-trip)
 *   negotiate  the journey modal: the three ways to act on the saving
 *
 *   Exactly one step is ever `now`, so there is never more than one green
 *   circle on screen. Everything before it is `done`; everything after, `todo`.
 *
 * The step is passed in rather than inferred here — this component owns no
 * state, so the same bar can be dropped into any screen that knows where it is.
 * --------------------------------------------------------------------------- */
import './StepBar.css';

export const STEPS = [
  { key: 'input',     label: 'Input' },
  { key: 'compare',   label: 'Compare' },
  { key: 'unlock',    label: 'Unlock savings' },
  { key: 'negotiate', label: 'Negotiate' },
];

export default function StepBar({ current = 'input', className = '', active = true }) {
  // An unknown key falls back to the first step rather than rendering a bar
  // with nothing lit — findIndex returns -1 for a typo.
  const idx = STEPS.findIndex((s) => s.key === current);
  const at = idx < 0 ? 0 : idx;

  return (
    <ol className={`steps${className ? ` ${className}` : ''}`} aria-label="Your progress">
      {STEPS.map((s, i) => {
        // `active` false means the screen has been reached but nothing done on
        // it yet — the first step before a single field is filled. It draws as
        // a step still ahead, and lights up the moment there is something to
        // show for it.
        const state = i < at ? 'done' : i === at && active ? 'now' : 'todo';
        return (
          <li
            key={s.key}
            className={`steps__item is-${state}`}
            aria-current={state === 'now' ? 'step' : undefined}
          >
            {/* The tick and the number are decoration: a screen reader gets the
                label plus aria-current, which is the whole meaning. */}
            <span className="steps__dot" aria-hidden="true">{state === 'done' ? '✓' : i + 1}</span>
            <span className="steps__label">{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
