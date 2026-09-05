import CorporateCertificate from './CorporateCertificate.jsx';
import IndividualCertificate from './IndividualCertificate.jsx';

// Routes to the right certificate for the audience. Both are formal award
// documents now, but they're made out to different holders and say different
// things: an SME's goes to the company and speaks to treasury stewardship, an
// individual's goes to the person. Each owns its own layout and PNG export.
export default function Certificate({ segment = 'individual', ...props }) {
  return segment === 'sme'
    ? <CorporateCertificate {...props} />
    : <IndividualCertificate {...props} />;
}
