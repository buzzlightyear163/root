# ROOT

Buys the root. Never the copy.

Static site + two small Vercel functions.

- `index.html`, `styles.css`, `app.js`: the page
- `engine.js`: the root finder (DexScreener public API, no key)
- `api/dex.js`: same-origin fallback for DexScreener if the browser cannot reach it
- `api/img.js`: token thumbnails, same-origin, so copies can be compared pixel by pixel with the root

Set the $ROOT contract address and X link at the top of `app.js` (`SITE.ca`, `SITE.x`).
`?q=name` in the URL runs a search on load.
