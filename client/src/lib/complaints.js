/* Complaint escalation ladders, per market.
 *
 * WHY THIS IS SPLIT IN TWO
 *   The PROCESS (who you complain to, in what order, and the deadlines) is set
 *   by each regulator, changes rarely, and applies to every bank in the market.
 *   That lives here, in code.
 *
 *   The per-bank CONTACTS (the named grievance officer, their email and direct
 *   line) change constantly and differ for all 45 institutions we track. Those
 *   live in public.complaint_contacts, one verified row at a time. They are NOT
 *   in this file and must never be guessed into it.
 *
 * THE RULE, SAME AS THE RATE DATA
 *   Every phone number, email and URL below was read off the official page cited
 *   in `sourceUrl` on `checkedOn`. Nothing here is written from memory. A wrong
 *   grievance email is worse than none: a customer with a real complaint sends
 *   it into the void and the clock on their escalation deadline keeps running.
 *
 *   `verified: false` means we could NOT reach the official page and the detail
 *   came from a secondary source. The UI shows it differently and tells the
 *   reader to confirm. Do not flip that flag without re-reading the page.
 */

/* Verified 2026-09-18 against the official sources cited on each entry. */
const CHECKED = '2026-09-18';

export const ESCALATION = {
  IN: {
    name: 'India',
    // Level 1 and 2 are the bank's own ladder; RBI requires every bank to
    // publish it. The named officers come from complaint_contacts.
    steps: [
      {
        level: 1,
        title: 'The bank’s own customer care',
        who: 'Branch manager or the bank’s customer-care team',
        how: 'Complain in writing (email or the bank’s complaint form) and keep the complaint reference number. Everything after this step depends on being able to prove you started here.',
      },
      {
        level: 2,
        title: 'The bank’s Nodal / Principal Nodal Officer',
        who: 'Principal Nodal Officer — every bank must publish one',
        how: 'Escalate in writing, quoting the original reference number. The officer’s name, email and phone are on the bank’s grievance-redressal page.',
      },
      {
        level: 3,
        title: 'RBI Ombudsman',
        who: 'Reserve Bank of India — Integrated Ombudsman Scheme',
        how: 'File online at the RBI CMS portal, or call the contact centre. Free. Escalate only after the bank has replied, or has failed to reply within the period the scheme allows.',
      },
    ],
    regulator: {
      name: 'RBI Ombudsman (Reserve Bank – Integrated Ombudsman Scheme)',
      portal: 'https://cms.rbi.org.in',
      phone: '14448',
      phoneNote: 'IVRS 24×7. Agents Monday–Saturday 08:00–22:00, English, Hindi and ten regional languages, except national holidays.',
      email: null,
      // Read off rbi.org.in/Scripts/Complaints.aspx: crpc@rbi.org.in is for
      // complaints AGAINST the RBI itself, NOT against a bank. Putting it here
      // would send every customer to the wrong desk.
      emailNote: 'RBI publishes no email for bank complaints — use the CMS portal or the phone line. (crpc@rbi.org.in is for complaints against the RBI itself, not against a bank.)',
      directory: 'https://rbi.org.in/Scripts/AboutUsDisplay.aspx?pg=BankingOmbudsmen.htm',
      directoryNote: 'Addresses and phone numbers for the Ombudsman offices across 24 centres.',
      sourceUrl: 'https://cms.rbi.org.in/',
      checkedOn: CHECKED,
      verified: true,
    },
    /* Read from the RB-IOS 2026 FAQ (Q17), text extracted from the PDF with
       pdftotext rather than summarised, because the numbers are the whole point.
       Note: search results widely repeat a "one year" limit — that is the
       superseded 2002 Banking Ombudsman Scheme. RB-IOS 2026 says 90 days. */
    deadlines: 'Complain to the bank first. You may go to the Ombudsman once the bank has not replied within 30 days (or the longer period any RBI/NPCI/Card Network guideline allows), or if you are not satisfied with its reply. You must then file within 90 days of that timeline expiring or of the bank\u2019s last communication, whichever is later.',
    deadlinesNote: null,
    scheme: {
      name: 'Reserve Bank \u2013 Integrated Ombudsman Scheme, 2026 (RB-IOS, 2026)',
      note: 'In force from 1 July 2026; replaces RB-IOS 2021. Cost-free to the complainant.',
      sourceUrl: 'https://www.rbi.org.in/commonman/Upload/English/FAQs/PDFs/RBIOS01072026.pdf',
      checkedOn: CHECKED,
    },
  },

  SG: {
    name: 'Singapore',
    steps: [
      {
        level: 1,
        title: 'The bank’s complaints team',
        who: 'The financial institution’s own complaints handling unit',
        how: 'Complain in writing and ask for their final reply. FIDReC will not take the case until the institution has had its chance.',
      },
      {
        level: 2,
        title: 'The bank’s senior / dispute resolution team',
        who: 'The institution’s escalation or quality-assurance team',
        how: 'Ask for the complaint to be reviewed at a senior level and for a written final response. The final reply is what starts the FIDReC clock.',
      },
      {
        level: 3,
        title: 'FIDReC',
        who: 'Financial Industry Disputes Resolution Centre',
        how: 'Register and complete the online Dispute Resolution Form. Free for consumers. Early resolution, then mediation, then adjudication if needed.',
      },
    ],
    regulator: {
      name: 'FIDReC (Financial Industry Disputes Resolution Centre)',
      portal: 'https://www.fidrec.com.sg/',
      phone: '+65 6327 8878',
      phoneNote: 'Monday–Friday 09:00–18:00, excluding public holidays. Walk-in by appointment only. (+65 6327 8488 is the fax, not a phone line.)',
      email: null,
      emailNote: 'Complaints are filed through the online Dispute Resolution Form, not by email. The published addresses (subscription@, corpcomms@, feedback@, pdata@) are for institutions, media, feedback and data-protection queries — not for filing a dispute.',
      address: '36 Robinson Road #15-01, City House, Singapore 068877',
      sourceUrl: 'https://www.fidrec.com.sg/contact-us/',
      checkedOn: CHECKED,
      verified: true,
    },
    deadlines: 'File within 6 months of receiving the financial institution’s final reply. You must approach the institution first.',
    deadlinesNote: null,
  },

  MY: {
    name: 'Malaysia',
    steps: [
      {
        level: 1,
        title: 'The bank’s complaints unit',
        who: 'The financial service provider’s own complaints desk',
        how: 'File a formal written complaint and keep the acknowledgement. FMOS requires proof you started here.',
      },
      {
        level: 2,
        title: 'Wait for the provider’s decision',
        who: 'The provider’s senior complaints / ombudsman liaison',
        how: 'The provider has 60 days to respond. If they reply, that decision starts your filing window; if they do not, the 60 days expiring is itself your route on.',
      },
      {
        level: 3,
        title: 'FMOS',
        who: 'Financial Markets Ombudsman Service',
        how: 'File through the FMOS complaint portal. Free and independent.',
      },
    ],
    regulator: {
      name: 'FMOS (Financial Markets Ombudsman Service)',
      portal: 'https://complaint.fmos.org.my',
      website: 'https://www.fmos.org.my/',
      phone: '+603-2272 2811',
      phoneNote: 'Monday–Friday 08:30–17:30.',
      email: null,
      emailNote: 'FMOS publishes no complaint email — disputes go through the online portal.',
      address: 'Level 14, Menara Takaful Malaysia, No 4, Jalan Sultan Sulaiman, 50000 Kuala Lumpur',
      // Worth knowing on a call: the name changed, and customers may still be
      // looking for the old body.
      note: 'Established 1 January 2025 by merging the Ombudsman for Financial Services (OFS) and the Securities Industry Dispute Resolution Center (SIDREC). Customers searching for "OFS" will land on FMOS.',
      sourceUrl: 'https://www.fmos.org.my/en/contact-us',
      checkedOn: CHECKED,
      verified: true,
    },
    deadlines: 'The provider has 60 days to respond. File with FMOS within 6 months of their final decision — or once the 60 days lapse without a reply.',
    deadlinesNote: null,
  },

  TH: {
    name: 'Thailand',
    steps: [
      {
        level: 1,
        title: 'The bank’s call centre or branch',
        who: 'The bank’s own customer service',
        how: 'Complain in writing and keep the reference number.',
      },
      {
        level: 2,
        title: 'The bank’s complaint-handling unit',
        who: 'The bank’s designated complaints department',
        how: 'Escalate in writing and ask for a formal written response.',
      },
      {
        level: 3,
        title: 'Bank of Thailand — Financial Consumer Protection Centre',
        who: 'Bank of Thailand (BOT)',
        how: 'Call the 1213 hotline or file through the BOT complaint portal.',
      },
    ],
    regulator: {
      name: 'Bank of Thailand — Financial Consumer Protection Centre (FCC)',
      portal: 'https://services.bot.or.th/cpm',
      phone: '1213',
      phoneNote: null,
      email: 'fcc@bot.or.th',
      emailNote: 'contact@bot.or.th is the BOT general enquiry address.',
      sourceUrl: 'https://www.bot.or.th/en/contact-us.html',
      checkedOn: CHECKED,
      verified: true,
    },
    deadlines: null,
    deadlinesNote: 'We have not verified BOT’s filing deadlines against an official page. Confirm before advising a customer.',
  },

  ID: {
    name: 'Indonesia',
    steps: [
      {
        level: 1,
        title: 'The bank’s customer service',
        who: 'The bank’s own complaints channel',
        how: 'Complain in writing and keep the ticket number.',
      },
      {
        level: 2,
        title: 'The bank’s complaint-handling unit',
        who: 'The bank’s designated complaints department',
        how: 'Escalate in writing and ask for a written final response.',
      },
      {
        level: 3,
        title: 'OJK — Kontak 157',
        who: 'Otoritas Jasa Keuangan (OJK), the financial services authority',
        how: 'File through the APPK consumer protection portal, the 157 line, WhatsApp or email.',
      },
    ],
    regulator: {
      name: 'OJK — Kontak 157 (Otoritas Jasa Keuangan)',
      portal: 'https://kontak157.ojk.go.id/appkpublicportal/',
      phone: '157',
      phoneNote: 'Monday–Friday 08:00–17:00, excluding holidays. WhatsApp 081157157157.',
      email: 'konsumen@ojk.go.id',
      emailNote: null,
      sourceUrl: 'https://ojk.go.id/en/contact.aspx',
      checkedOn: CHECKED,
      // ojk.go.id refused the connection from our network on the check date, so
      // these came from OJK-domain search results rather than a page we read.
      // Confirm before relying on them with a customer.
      verified: false,
      unverifiedReason: 'ojk.go.id was unreachable on the check date (connection refused). These details come from OJK-domain search results, not a page we read directly.',
    },
    deadlines: null,
    deadlinesNote: 'Not verified. Confirm on the OJK portal before advising a customer.',
  },
};

export const escalationFor = (cc) => ESCALATION[String(cc || '').toUpperCase()] || null;

/* What every market has in common, and what we tell a customer regardless of
   where their bank is. Stated as process, not as a promise about the outcome. */
export const UNIVERSAL_TIPS = [
  'Complain in writing, even if you also phone. A complaint you cannot prove you made is a complaint that did not happen.',
  'Get the reference number at level 1 and quote it at every step. Ombudsman schemes will ask for it.',
  'Ask explicitly for a “final response” in writing. In most markets that letter is what starts the clock on your right to escalate.',
  'Keep the dates. Every escalation route has a deadline measured from the bank’s final reply.',
  'Say what outcome you want — a refund, a repricing, a fee reversal. A complaint without a requested remedy is much easier to close as “noted”.',
  'Pricing complaints are not always “mis-selling”. If the bank simply charges more than the market, that is a commercial negotiation, not a regulatory breach — the ombudsman route is for unfair treatment, error or a term not honoured.',
];
