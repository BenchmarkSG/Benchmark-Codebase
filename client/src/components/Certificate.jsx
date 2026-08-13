import './Certificate.css';

// Shareable "certificate" shown on the $1 social-share path. SMEs get the
// "Smart Treasury" tagline; individuals get "Smart Saver" — everything else is
// shared copy. The QR points back to the site (rendered via a lightweight
// external QR image service; swap for a self-hosted generator if preferred).
const TAGLINE = {
  sme: 'Certified Smart Treasury',
  individual: 'Certified Smart Saver',
};

export default function Certificate({ segment = 'individual', product, savingPct }) {
  const title = TAGLINE[segment] || TAGLINE.individual;
  const service = product || 'banking costs';
  const site = typeof window !== 'undefined' ? window.location.origin : 'https://bankbenchmark.sg';
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=0&data=${encodeURIComponent(site)}`;
  const savedLine = savingPct
    ? <>We saved <strong>{savingPct}%</strong> on our <strong>{service}</strong> by comparing our bank costs with the fee-benchmarking tool at <strong>BankBenchmark.sg</strong> — you could too. Please share widely.</>
    : <>We compared our <strong>{service}</strong> against the market with the fee-benchmarking tool at <strong>BankBenchmark.sg</strong> — and found real savings. You could too. Please share widely.</>;

  return (
    <div className="cert">
      <div className="cert__ribbon">🏅 {title}</div>
      <h3 className="cert__head">Stop Overpaying Your Bank by Thousands Every Year</h3>
      <p className="cert__body">{savedLine}</p>
      <p className="cert__q">Your bank is profiting from you — find out by how much.</p>
      <div className="cert__foot">
        <div className="cert__brand">
          <span className="cert__logo">Bank<span>Benchmark</span></span>
          <span className="cert__handle">@BankBenchmark · bankbenchmark.sg</span>
        </div>
        <img className="cert__qr" src={qrSrc} alt="Scan to benchmark your bank" loading="lazy" />
      </div>
    </div>
  );
}
