# Manual rate files

- `manual-unverified.csv` — rows extracted by a model from bank pages that
  **could not be verified from here** (the bank blocks automation, or the page
  renders blank to a headless browser). Each row keeps the extractor's URL and
  verbatim quote. **Do not import as is.** Open the URL, confirm the figure is
  on the live page today (the notes say which column), fix the rate if it has
  moved, delete the rows you could not confirm, then:

  ```
  npm run import:pool:dry -- data/rate-templates/manual-unverified.csv
  npm run import:pool     -- data/rate-templates/manual-unverified.csv --merge
  ```

  Rows whose rate reads `NOT FOUND` are skipped. Everything else the two
  extraction passes produced was either verified against the live page and
  turned into a nightly scraper source (see `scripts/scrape-pool.mjs`), or
  differed from the live page and was dropped.

- `scraped-*.csv` — written by `npm run scrape:pool` (gitignored; regenerated
  nightly). `*.csv` without a prefix are blank fill templates from
  `npm run import:template`.
