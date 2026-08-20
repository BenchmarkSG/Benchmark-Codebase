import './NeedHelp.css';

// Customer-service WhatsApp number in international format, DIGITS ONLY (no "+",
// spaces or dashes) — e.g. 65XXXXXXXX for a Singapore line. Set it in the client
// env as VITE_WHATSAPP_NUMBER. NO fallback: without a real number the widget
// doesn't render (a placeholder would send customers to a stranger's phone).
const NUMBER = (import.meta.env.VITE_WHATSAPP_NUMBER || '').replace(/[^\d]/g, '');

// Pre-filled first message (text only — this opens a WhatsApp chat, never a call).
const MESSAGE =
  import.meta.env.VITE_WHATSAPP_MESSAGE ||
  'Hi FeeOptima team, I need help with a benchmark / my bank fees.';

const WA_URL = `https://wa.me/${NUMBER}?text=${encodeURIComponent(MESSAGE)}`;

const WhatsAppIcon = () => (
  <svg viewBox="0 0 32 32" width="22" height="22" fill="currentColor" aria-hidden="true">
    <path d="M16.04 3.5c-6.9 0-12.5 5.6-12.5 12.5 0 2.2.58 4.35 1.68 6.25L3.5 28.5l6.42-1.68a12.46 12.46 0 0 0 6.12 1.56c6.9 0 12.5-5.6 12.5-12.5S22.94 3.5 16.04 3.5Zm0 22.83c-1.9 0-3.77-.51-5.4-1.48l-.39-.23-3.81 1 1.02-3.71-.25-.4a10.34 10.34 0 0 1-1.59-5.5c0-5.72 4.66-10.38 10.4-10.38 5.73 0 10.38 4.66 10.38 10.39 0 5.73-4.65 10.38-10.37 10.38Zm5.7-7.77c-.31-.16-1.85-.91-2.14-1.02-.29-.1-.5-.16-.71.16-.21.31-.82 1.02-1 1.23-.19.21-.37.24-.68.08-.31-.16-1.32-.49-2.51-1.55-.93-.83-1.55-1.85-1.74-2.16-.18-.31-.02-.48.14-.64.14-.14.31-.37.47-.55.16-.19.21-.32.31-.53.1-.21.05-.4-.03-.55-.08-.16-.71-1.71-.97-2.34-.26-.62-.52-.53-.71-.54l-.6-.01c-.21 0-.55.08-.84.4-.29.31-1.1 1.08-1.1 2.63 0 1.55 1.13 3.05 1.29 3.26.16.21 2.22 3.39 5.38 4.76.75.32 1.34.51 1.8.66.76.24 1.44.21 1.99.13.61-.09 1.85-.76 2.11-1.48.26-.73.26-1.35.18-1.48-.08-.13-.29-.21-.6-.37Z" />
  </svg>
);

/** Floating "Need Help?" widget that opens a WhatsApp text chat with support.
    Renders nothing until VITE_WHATSAPP_NUMBER is configured. */
export default function NeedHelp() {
  if (!NUMBER) return null;
  return (
    <a
      className="needhelp"
      href={WA_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Need help? Chat with us on WhatsApp"
      title="Chat with us on WhatsApp"
    >
      <span className="needhelp__icon"><WhatsAppIcon /></span>
      <span className="needhelp__label">Need Help?</span>
    </a>
  );
}
