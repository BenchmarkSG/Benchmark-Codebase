import { useEffect, useState } from 'react';

/* Placeholder profile picture, shown wherever a user hasn't uploaded one.
   A self-contained SVG (no external asset, no network request) so it renders
   instantly at any size — the circle is drawn at 100% of whatever box the
   avatar CSS gives it. */
export default function DefaultAvatar({ className = '', title }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title || 'Default profile picture'}
      focusable="false"
    >
      <circle cx="32" cy="32" r="32" fill="#dbe6f6" />
      {/* head + shoulders silhouette, clipped to the circle */}
      <g fill="#8ba3c7">
        <circle cx="32" cy="25" r="11" />
        <path d="M32 39c-10.5 0-19 6.4-19 14.3V56a32 32 0 0 0 38 0v-2.7C51 45.4 42.5 39 32 39Z" />
      </g>
    </svg>
  );
}

/* A user's profile picture with a guaranteed fallback.
   Falls back to DefaultAvatar when there's no URL *or* the image fails to load —
   which happens more often than you'd think: OAuth avatars (Google's
   lh3.googleusercontent.com) get blocked by privacy extensions or rejected on a
   referrer check, and a storage URL can outlive the file behind it. Without this
   the browser paints its broken-image icon.
   `referrerPolicy="no-referrer"` is what stops Google's 403s on those avatars. */
export function Avatar({ url, className = '', alt = '' }) {
  const [failed, setFailed] = useState(false);

  // A new URL deserves a fresh attempt (e.g. right after an upload).
  useEffect(() => { setFailed(false); }, [url]);

  if (!url || failed) return <DefaultAvatar className={className} />;
  return (
    <img
      className={className}
      src={url}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
