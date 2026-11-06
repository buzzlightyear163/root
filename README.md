# ROOT

Buys the root. Never the copy.

Static site + one Vercel function.

- `index.html`, `styles.css`, `app.js`: the page
- `engine.js`: the root finder (DexScreener public API, no key)
- `api/pump.js`: pump.fun search, oldest first (no key), merged into the finder

Set the $ROOT contract address and X link at the top of `app.js` (`SITE.ca`, `SITE.x`).
`?q=name` in the URL runs a search on load.
