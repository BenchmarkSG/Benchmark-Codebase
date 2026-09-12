# Outward-remittance fees — the part a person has to read

`scripts/scrape-remit.mjs` reads each bank's telegraphic-transfer buy/sell
rates every night and computes the FX spread. It refuses to write a row until
the bank's flat outward-TT fee has been read from the bank's own tariff and
entered in the source with the URL and the date — because a pool that carries
spreads but no fees would tell a customer sending S$1,000 that the bank is
cheaper than it is.

Fill in `fee: { amount, currency, asOf, url }` for each source below, then
run `npm run scrape:remit` and `npm run import:remit -- data/rate-templates/remit-ID.csv`.
The scraper stops a source whose fee is older than 120 days.

| Bank | Where the tariff is | What to read |
|---|---|---|
| 🇮🇩 Bank Mandiri | https://www.bankmandiri.co.id/kirim-uang-ke-luar-negeri (the page exists; the fee is not in the rendered text — look for "biaya" in the FAQ or the linked tariff) | Flat fee for an outgoing USD transfer to a bank abroad, IDR, plus any correspondent charge (USD) |
| 🇮🇩 Bank Central Asia | BCA's "Biaya & Limit" for Outward Remittance / Kiriman Uang Luar Negeri (the URLs tried all 404 — find it from the site menu) | Same |
| 🇮🇩 OCBC Indonesia | OCBC's remittance page (renders blank to automation) | Same |
| 🇹🇭 Bangkok Bank | https://www.bangkokbank.com/en/Personal/Other-Services/View-Rates/Fees-and-Charges (cookie wall blocks automation) | Outward TT fee in THB, and whether the "full amount" option adds a correspondent charge |

Not readable by machine at all tonight, so no spread source yet either:
Singapore (DBS shows one online rate against no mid; OCBC, UOB, HSBC, Standard
Chartered publish no table a browser can read), Malaysia (CIMB, Public Bank,
RHB, Hong Leong render nothing), India (HDFC's forex card rates are a PDF that
would not download; SBI's is behind a maintenance redirect), Thailand except
Bangkok Bank (Kasikorn blocks; SCB, Krungthai, Krungsri, TTB draw rates in
components). A person can still read those tariffs and rate boards; use
`import:remit` with a hand-made CSV in the header format of `remit-ID.csv`.
