// Sharing the certificate to a named network.
//
// Worth knowing before changing anything here: the certificate is an IMAGE we
// generate in the browser, and no network exposes a web endpoint that accepts
// an uploaded image from a third-party page.
//   · LinkedIn / Facebook — take a URL and render whatever OG image that link
//                           advertises. They will never render a file we hand them.
//   · X                   — text + URL only.
//   · Instagram           — no share endpoint at all, on any surface.
// So there are exactly two honest routes, and every button below uses one:
//   1. The OS share sheet with the PNG attached (phone/tablet). Picking
//      Instagram there opens Instagram with the certificate already attached,
//      ready to post as a story or a feed post — this is the ONLY route that
//      gets the image into Instagram, on any browser. A page cannot hand an
//      image straight to the app: iOS's instagram-stories:// scheme reads it
//      from a native pasteboard JS can't write, and an Android SEND intent
//      needs a content:// URI the app can read, which a blob URL isn't.
//   2. Save the PNG + copy the caption, then open the network's composer so the
//      user attaches it themselves (laptop/desktop).
// Anything that claims to post the image straight to a feed would be a lie.
//
// The links below are plain https, never app schemes: on a phone the OS routes
// them into the installed app as universal/app links, and on a laptop — or a
// phone without the app — they open the website instead of a dead end.

const enc = encodeURIComponent;

export const NETWORKS = {
  linkedin: {
    id: 'linkedin',
    label: 'LinkedIn',
    title: 'Share on LinkedIn',
    href: (url) => `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`,
  },
  x: {
    id: 'x',
    label: 'X',
    title: 'Share on X (formerly Twitter)',
    href: (url, text) => `https://x.com/intent/post?text=${enc(text)}&url=${enc(url)}`,
  },
  instagram: {
    id: 'instagram',
    label: 'Instagram',
    title: 'Share on Instagram',
    // No composer URL exists, so desktop lands on the app itself with the
    // certificate already saved and the caption already copied.
    href: () => 'https://www.instagram.com/',
  },
  meta: {
    id: 'meta',
    label: 'Meta',
    title: 'Share on Facebook (Meta)',
    href: (url, text) => `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}&quote=${enc(text)}`,
  },
};

// Who gets which buttons. SMEs post to the professional networks first;
// individuals lead with the visual ones, where the certificate itself is the post.
export const NETWORKS_FOR = {
  sme: ['linkedin', 'x', 'instagram', 'meta'],
  individual: ['instagram', 'meta', 'linkedin'],
};

/** Is this a phone/tablet — i.e. is there an Instagram app behind these links?
 *  Deliberately not "does the Web Share API exist": macOS Safari and Windows
 *  Chrome both have it, so an API check alone would answer a laptop click with
 *  an OS share dialog that has no social apps in it. UA-CH first because a
 *  touchscreen laptop reports a coarse pointer and would otherwise pass. */
export function isHandheld() {
  try {
    if (typeof navigator.userAgentData?.mobile === 'boolean') return navigator.userAgentData.mobile;
    const coarse = window.matchMedia?.('(pointer: coarse)')?.matches;
    return !!coarse && (navigator.maxTouchPoints || 0) > 0;
  } catch {
    return false;
  }
}

/** Can this browser share an actual file (i.e. attach the certificate)?
 *  Probed synchronously so a click handler can decide whether to open a
 *  composer window before it awaits anything — popup blockers only allow
 *  window.open during the click itself. */
export function supportsFileShare() {
  try {
    if (!navigator.share || !navigator.canShare) return false;
    const probe = new File([new Uint8Array(1)], 'certificate.png', { type: 'image/png' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/** Save a generated File to the user's device. */
export function saveFile(file) {
  const href = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = href;
  a.download = file.name || 'feeoptima-certificate.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 4000);
}

/** Copy text, reporting whether it actually landed (clipboard can be blocked). */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
