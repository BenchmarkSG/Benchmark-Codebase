import { useEffect } from 'react';
import './LegalPage.css';
import { Footer } from './Sections.jsx';

/* Standalone legal pages rendered by the hash router (#terms, #privacy).
   Content is intentionally plain data so it's easy to hand to counsel for
   review before launch. Effective date is fixed, not auto-generated. */

const EFFECTIVE_DATE = '7 August 2026';
const CONTACT_EMAIL = 'hello@feeoptima.com';
const PRIVACY_EMAIL = 'privacy@feeoptima.com';

const TERMS = {
  title: 'Terms & Conditions',
  intro:
    'These Terms govern your access to and use of FeeOptima (the “Service”). By using the Service, creating an account, or submitting information through it, you agree to these Terms. If you do not agree, please do not use the Service.',
  sections: [
    {
      h: '1. Who we are',
      p: [
        'FeeOptima is an independent rate- and fee-benchmarking service for individuals, SMEs and corporates across Singapore and South-East Asia.',
        'We are not a bank, a financial adviser, a broker, or a holder of a Capital Markets Services licence, and we are not licensed or regulated by the Monetary Authority of Singapore (MAS).',
      ],
    },
    {
      h: '2. Not financial advice',
      p: [
        'Nothing on the Service constitutes financial, legal, tax, or investment advice, or an offer, recommendation, or solicitation to buy, sell, or arrange any product or service.',
        'Benchmarks are indicative estimates based on curated market data together with anonymised, crowdsourced figures. They are illustrative and your actual rates, fees, and terms will depend on your own circumstances and each provider’s assessment. For regulated financial advice, please consult a MAS-licensed institution.',
      ],
    },
    {
      h: '3. Eligibility',
      p: [
        'You must be at least 18 years old and able to form a binding contract to use the Service. If you use the Service on behalf of an organisation, you confirm you are authorised to bind that organisation to these Terms.',
      ],
    },
    {
      h: '4. Accounts',
      p: [
        'Some features require an account. You agree to provide accurate information and to keep your login credentials secure. You are responsible for activity that occurs under your account. Sign-in may be provided through third-party identity providers (e.g. Google); their terms also apply to that sign-in.',
      ],
    },
    {
      h: '5. Information you provide',
      p: [
        'When you use the calculator, request a reveal, complete a health check, or apply as an advisor, you may provide information about yourself or your business. You agree not to submit information you are not entitled to share.',
        'Please mask account numbers, beneficiary names, and references before sharing any transaction data. We do not need — and ask you not to send — account-identifying data. See our Privacy Policy for how we handle the information you provide.',
      ],
    },
    {
      h: '6. Negotiation and expert services',
      p: [
        'Where you choose to engage our negotiation concierge or an expert introduction, separate terms (including any success-fee arrangement) will be provided and must be agreed before that service begins. Any savings figures shown beforehand are estimates, not guarantees.',
      ],
    },
    {
      h: '7. Advisor applications',
      p: [
        'If you apply to join as an advisor, you confirm the information and any materials you submit (including a photo) are accurate and that you have the right to share them. Acceptance is at our discretion, and inclusion does not create an employment or agency relationship unless separately agreed in writing.',
      ],
    },
    {
      h: '8. Third-party names and links',
      p: [
        'Bank and provider names and logos are shown for identification only. We are not affiliated with, sponsored by, or endorsed by any bank or provider. The Service may link to third-party sites (for example, scheduling tools); we are not responsible for their content or practices.',
      ],
    },
    {
      h: '9. Intellectual property',
      p: [
        'The Service, including its content, design, and software, is owned by FeeOptima or its licensors and is protected by law. You may use it for your own personal or internal business purposes only, and you may not copy, scrape, resell, or create derivative works from it without our written permission.',
      ],
    },
    {
      h: '10. Disclaimers',
      p: [
        'The Service is provided “as is” and “as available”, without warranties of any kind, whether express or implied, including as to accuracy, completeness, fitness for a particular purpose, or uninterrupted availability. Benchmarks and figures may be out of date or incomplete.',
      ],
    },
    {
      h: '11. Limitation of liability',
      p: [
        'To the maximum extent permitted by law, FeeOptima and its team will not be liable for any indirect, incidental, or consequential loss, or for any loss of profits, savings, data, or goodwill, arising from your use of, or reliance on, the Service. Nothing in these Terms excludes liability that cannot be excluded under applicable law.',
      ],
    },
    {
      h: '12. Changes',
      p: [
        'We may update the Service and these Terms from time to time. Material changes will be reflected by updating the “Last updated” date below. Your continued use after changes take effect constitutes acceptance of the revised Terms.',
      ],
    },
    {
      h: '13. Governing law',
      p: [
        'These Terms are governed by the laws of Singapore, and the courts of Singapore have exclusive jurisdiction over any dispute arising from them or the Service.',
      ],
    },
    {
      h: '14. Contact',
      p: [`Questions about these Terms? Email us at ${CONTACT_EMAIL}.`],
    },
  ],
};

const PRIVACY = {
  title: 'Privacy Policy',
  intro:
    'This Privacy Policy explains how FeeOptima collects, uses, discloses, and protects personal data when you use the Service. We handle personal data in accordance with Singapore’s Personal Data Protection Act 2012 (PDPA).',
  sections: [
    {
      h: '1. Scope',
      p: [
        'This policy applies to the FeeOptima website and app. It covers personal data of visitors, registered users, health-check respondents, and advisor applicants.',
      ],
    },
    {
      h: '2. What we collect',
      list: [
        'Account data: your name, email, phone (WhatsApp) number, and monthly-income bracket when you register.',
        'Health-check and enquiry data: your answers, and the name, company, email, and phone you share when you ask to speak with an expert.',
        'Advisor application data: the professional details, description, and photo you submit if you apply as an advisor.',
        'Benchmarking inputs: the figures you enter into the calculator. We use these to produce your estimate and retain only anonymised metrics (such as fees, margins, and volumes) — not account-identifying data.',
        'Technical data: basic device, browser, and usage information needed to run and secure the Service.',
      ],
    },
    {
      h: '3. How we use it',
      list: [
        'To provide the Service — generate benchmarks, run health checks, and manage your account.',
        'To contact you about a benchmark, enquiry, expert introduction, or advisor application you initiated.',
        'To improve and secure the Service, including producing aggregated, anonymised insights.',
        'To comply with legal obligations.',
      ],
    },
    {
      h: '4. Consent and legal basis',
      p: [
        'We collect and use personal data with your consent — for example, when you register, submit a form, or tick a consent box — and where otherwise permitted under the PDPA. You may withdraw consent at any time (see “Your rights”), though this may limit features available to you.',
      ],
    },
    {
      h: '5. Service providers and disclosure',
      p: [
        'We do not sell your personal data. We share it only with providers who help us run the Service, under appropriate safeguards:',
      ],
      list: [
        'Supabase — authentication, database, and file storage.',
        'Identity providers (e.g. Google) — only if you choose to sign in with them.',
        'Scheduling tools (e.g. Calendly) — only if you choose to book a call.',
        'Where you ask for an expert or negotiation introduction, the relevant details you provide, so they can follow up with you.',
      ],
      after: [
        'Live foreign-exchange reference rates are retrieved from a public source (European Central Bank data) to compute cross-border cost estimates; no personal data is sent to obtain them.',
      ],
    },
    {
      h: '6. Cookies and local storage',
      p: [
        'We use only the cookies and local storage needed to keep you signed in, remember preferences, and enable the app (including offline/PWA functionality). We do not use them to build advertising profiles.',
      ],
    },
    {
      h: '7. Retention',
      p: [
        'We keep personal data only as long as needed for the purposes above or as required by law, after which it is deleted or anonymised. Anonymised benchmarking metrics, which no longer identify you, may be retained to improve the Service.',
      ],
    },
    {
      h: '8. Security',
      p: [
        'We use reasonable technical and organisational measures — including access controls and row-level security on our database — to protect personal data. No method of transmission or storage is completely secure, so we cannot guarantee absolute security.',
      ],
    },
    {
      h: '9. International transfers',
      p: [
        'Some of our providers may process data outside Singapore. Where they do, we take steps to ensure a standard of protection comparable to that required under the PDPA.',
      ],
    },
    {
      h: '10. Your rights',
      p: [
        `Subject to the PDPA, you may request access to, or correction of, your personal data, and you may withdraw consent to our use of it. To make a request, email ${PRIVACY_EMAIL}. We may need to verify your identity before acting on a request.`,
      ],
    },
    {
      h: '11. Children',
      p: [
        'The Service is not directed at children under 18, and we do not knowingly collect their personal data.',
      ],
    },
    {
      h: '12. Changes',
      p: [
        'We may update this policy from time to time. Material changes will be reflected by updating the “Last updated” date below.',
      ],
    },
    {
      h: '13. Contact',
      p: [`For any privacy question or request, email ${PRIVACY_EMAIL}.`],
    },
  ],
};

const DISCLAIMER = {
  title: 'Disclaimer',
  intro:
    'Please read this disclaimer carefully. It applies to all information, benchmarks, and figures shown on FeeOptima.',
  sections: [
    {
      h: '1. Independent, unlicensed service',
      p: [
        'FeeOptima is an independent rate- and fee-benchmarking service. It is not a bank, a financial adviser, or a Capital Markets Services licence holder, and it is not licensed or regulated by the Monetary Authority of Singapore (MAS).',
      ],
    },
    {
      h: '2. Not financial advice',
      p: [
        'Nothing on the Service is financial, legal, tax, or investment advice, or an offer, recommendation, or solicitation to buy, sell, or arrange any product. For regulated financial advice, please consult a MAS-licensed institution.',
      ],
    },
    {
      h: '3. Figures are indicative',
      p: [
        'Benchmarks are indicative estimates based on curated market data together with anonymised, crowdsourced figures. They are illustrative, may be incomplete or out of date, and your actual rates, fees, and terms will depend on your own circumstances and each provider’s assessment.',
      ],
    },
    {
      h: '4. Savings are not guaranteed',
      p: [
        'Any savings figures shown are estimates of what may be achievable and are not a promise or guarantee of any outcome.',
      ],
    },
    {
      h: '5. Third-party names and links',
      p: [
        'Bank and provider names and logos are shown for identification only. We are not affiliated with, sponsored by, or endorsed by any bank or provider. We are not responsible for third-party sites the Service may link to.',
      ],
    },
    {
      h: '6. No liability for your decisions',
      p: [
        'You are responsible for any decision you make. To the maximum extent permitted by law, FeeOptima accepts no liability for any loss arising from reliance on information shown on the Service. See our Terms & Conditions for the full limitation of liability.',
      ],
    },
  ],
};

const DOCS = { terms: TERMS, privacy: PRIVACY, disclaimer: DISCLAIMER };

// Stable anchor id from a heading like "4. Accounts" → "sec-4-accounts".
const slug = (h) => 'sec-' + h.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function Section({ s }) {
  return (
    <section className="legal__section" id={slug(s.h)} style={{ scrollMarginTop: '80px' }}>
      <h2>{s.h}</h2>
      {s.p?.map((t, i) => <p key={i}>{t}</p>)}
      {s.list && (
        <ul>{s.list.map((t, i) => <li key={i}>{t}</li>)}</ul>
      )}
      {s.after?.map((t, i) => <p key={i}>{t}</p>)}
    </section>
  );
}

const DOC_LINKS = [
  { key: 'terms', hash: '#terms', label: 'Terms & Conditions' },
  { key: 'privacy', hash: '#privacy', label: 'Privacy Policy' },
  { key: 'disclaimer', hash: '#disclaimer', label: 'Disclaimer' },
];

export default function LegalPage({ doc }) {
  const data = DOCS[doc] || TERMS;
  const others = DOC_LINKS.filter((d) => d.key !== doc);

  // Land at the top when navigating to a legal page.
  useEffect(() => { window.scrollTo(0, 0); }, [doc]);

  return (
    <>
      <header className="legal__topbar">
        <div className="container legal__topbar-inner">
          <a href="#top" className="legal__brand"><span>Fee</span>Optima</a>
          <a href="#top" className="legal__back">← Back to home</a>
        </div>
      </header>

      <main className="legal">
        <div className="container legal__inner">
          <h1 className="legal__title">{data.title}</h1>
          <p className="legal__updated">Last updated: {EFFECTIVE_DATE}</p>
          <p className="legal__intro">{data.intro}</p>

          {data.sections.length > 4 && (
            <nav className="legal__toc" aria-label="On this page">
              <span className="legal__toc-label">On this page</span>
              <ol>
                {data.sections.map((s) => (
                  <li key={s.h}>
                    <a
                      href={`#${slug(s.h)}`}
                      onClick={(e) => { e.preventDefault(); document.getElementById(slug(s.h))?.scrollIntoView({ behavior: 'smooth' }); }}
                    >{s.h}</a>
                  </li>
                ))}
              </ol>
            </nav>
          )}

          {data.sections.map((s) => <Section key={s.h} s={s} />)}

          <p className="legal__cross">
            See also our{' '}
            {others.map((o, i) => (
              <span key={o.key}>
                {i > 0 && (i === others.length - 1 ? ' and ' : ', ')}
                <a href={o.hash}>{o.label}</a>
              </span>
            ))}.
          </p>

          {doc !== 'disclaimer' && (
            <p className="legal__disclaimer">
              <strong>Regulatory note.</strong> FeeOptima is an independent rate- and fee-benchmarking
              service. It is not a bank, a financial adviser, or a Capital Markets Services licence holder,
              and is not licensed or regulated by the Monetary Authority of Singapore (MAS). Nothing here is
              financial, legal, or tax advice. Benchmarks are indicative and illustrative; bank names and logos
              are shown for identification only. For regulated financial advice, consult a MAS-licensed institution.
            </p>
          )}
        </div>
      </main>

      <Footer />
    </>
  );
}
