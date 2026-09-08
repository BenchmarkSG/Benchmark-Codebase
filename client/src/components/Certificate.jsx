import CorporateCertificate from './CorporateCertificate.jsx';
import IndividualCertificate from './IndividualCertificate.jsx';
import CertificateShare from './CertificateShare.jsx';

// Routes to the right certificate for the audience. Both are formal award
// documents now, but they're made out to different holders and say different
// things: an SME's goes to the company and speaks to treasury stewardship, an
// individual's goes to the person. Each owns its own layout and PNG export.
//
// The social share strip is shared and lives OUTSIDE the framed document — a
// row of network buttons inside a certificate would undo the formality both
// designs are working for, and it must never appear in the exported PNG.
export default function Certificate({ segment = 'individual', caption, buildFile, ...props }) {
  return (
    <div className="cert-wrap">
      {segment === 'sme'
        ? <CorporateCertificate {...props} />
        : <IndividualCertificate {...props} />}
      <CertificateShare segment={segment} caption={caption} buildFile={buildFile} />
    </div>
  );
}
