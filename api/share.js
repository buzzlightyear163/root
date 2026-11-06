// Serves the page with share tags filled in, so a ROOT link on X shows the root it found.
const fs = require('fs');
const path = require('path');

let html = null;
try { html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'); } catch (e) { html = null; }

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ADDR = /^([1-9A-HJ-NP-Za-km-z]{32,44}|0x[a-fA-F0-9]{40})$/;

module.exports = (req, res) => {
  if (!html) { res.statusCode = 302; res.setHeader('location', '/index.html'); return res.end(); }
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const origin = 'https://' + host;
  const q = String((req.query && req.query.q) || '').trim().replace(/^\$/, '').slice(0, 64);
  let out = html;
  const image = q ? origin + '/api/og?q=' + encodeURIComponent(q) : origin + '/og.png';
  out = out.split('content="/og.png"').join('content="' + esc(image) + '"');
  const url = origin + (q ? '/?q=' + encodeURIComponent(q) : '/');
  out = out.replace('<meta name="twitter:card"', '<meta property="og:url" content="' + esc(url) + '">\n<meta name="twitter:card"');
  if (q) {
    const label = ADDR.test(q) ? q.slice(0, 4) + '…' + q.slice(-4) : q;
    const title = 'Which ' + label + ' is the root? · ROOT';
    const desc = 'ROOT dated every contract named ' + label + ' and found the first one. See the root and every copy.';
    out = out
      .replace(/<title>[^<]*<\/title>/, '<title>' + esc(title) + '</title>')
      .replace(/<meta property="og:title" content="[^"]*">/, '<meta property="og:title" content="' + esc(title) + '">')
      .replace(/<meta property="og:description" content="[^"]*">/, '<meta property="og:description" content="' + esc(desc) + '">');
  }
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');
  res.statusCode = 200;
  return res.end(out);
};
