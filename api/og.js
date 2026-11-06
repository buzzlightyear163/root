// Share image for a search: /api/og?q=fartcoin -> 1200x630 PNG with the root and its copy count.
const fs = require('fs');
const path = require('path');
require('../engine.js');

const ASSETS = path.join(__dirname, '..', 'og-assets');
const read = (f) => fs.readFileSync(path.join(ASSETS, f));
let fonts, bg;
function load() {
  if (fonts) return;
  fonts = [
    { name: 'Archivo', data: read('archivo-800.woff'), weight: 800, style: 'normal' },
    { name: 'Archivo', data: read('archivo-400.woff'), weight: 400, style: 'normal' },
    { name: 'Martian', data: read('martian-400.woff'), weight: 400, style: 'normal' },
  ];
  bg = 'data:image/jpeg;base64,' + read('bg.jpg').toString('base64');
}

const el = (type, style, children, props) => ({ type, props: Object.assign({ style }, props || {}, children === undefined ? {} : { children }) });

async function tokenImage(url) {
  if (!url) return null;
  try {
    const id = (url.match(/\/cms\/images\/([A-Za-z0-9_-]{8,80})/) || [])[1];
    const src = id ? 'https://cdn.dexscreener.com/cms/images/' + id + '?width=256&height=256&fit=crop&quality=90&format=png' : url;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 3500);
    const r = await fetch(src, { signal: ctl.signal, headers: { accept: 'image/png,image/jpeg' } });
    clearTimeout(timer);
    const type = (r.headers.get('content-type') || '').split(';')[0];
    if (!r.ok || !/^image\/(png|jpe?g)$/.test(type)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 2 * 1024 * 1024) return null;
    return 'data:' + type + ';base64,' + buf.toString('base64');
  } catch (e) {
    return null;
  }
}

function card(r, pic) {
  const { fmt } = globalThis.ROOT;
  const n = r.copies.length;
  const name = r.root.name;
  const size = name.length <= 10 ? 96 : name.length <= 16 ? 74 : 56;
  const INK = '#0E1C4F', MUTED = '#56628A', RED = '#D2342C';
  return el('div', { width: 1200, height: 630, display: 'flex', position: 'relative', fontFamily: 'Archivo' }, [
    el('img', { position: 'absolute', left: 0, top: 0, width: 1200, height: 630 }, undefined, { src: bg, width: 1200, height: 630 }),
    pic
      ? el('img', { position: 'absolute', left: 860, top: 225, width: 180, height: 180, borderRadius: 90, objectFit: 'cover' }, undefined, { src: pic, width: 180, height: 180 })
      : el('div', { position: 'absolute', left: 860, top: 225, width: 180, height: 180, borderRadius: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 84, fontWeight: 800, color: INK }, (r.root.symbol || '?').charAt(0).toUpperCase()),
    el('div', { position: 'absolute', left: 72, top: 128, width: 590, display: 'flex', flexDirection: 'column' }, [
      el('div', { fontSize: 26, color: MUTED, fontWeight: 400 }, 'Which one is the root?'),
      el('div', { fontSize: size, color: INK, fontWeight: 800, lineHeight: 1, marginTop: 14, letterSpacing: -1 }, name),
      el('div', { fontSize: 32, color: INK, fontWeight: 400, marginTop: 24 }, `1 root. ${n} ${n === 1 ? 'copy' : 'copies'} on Solana.`),
      el('div', { fontSize: 18, color: RED, fontFamily: 'Martian', marginTop: 28 }, r.root.address),
      el('div', { fontSize: 22, color: MUTED, fontWeight: 400, marginTop: 12 }, `First seen ${fmt.day(r.root.firstSeen)}`),
    ]),
  ]);
}

module.exports = async (req, res) => {
  const q = String((req.query && req.query.q) || '').trim().slice(0, 64);
  const fallback = () => { res.statusCode = 302; res.setHeader('location', '/og.png'); res.setHeader('cache-control', 'public, s-maxage=60'); res.end(); };
  if (!q) return fallback();
  try {
    load();
    const [{ ImageResponse }, r] = await Promise.all([import('@vercel/og'), globalThis.ROOT.find(q, { quick: true })]);
    const pic = await tokenImage(r.root.image);
    const img = new ImageResponse(card(r, pic), { width: 1200, height: 630, fonts });
    const buf = Buffer.from(await img.arrayBuffer());
    res.setHeader('content-type', 'image/png');
    res.setHeader('cache-control', 'public, max-age=600, s-maxage=1800, stale-while-revalidate=86400');
    res.statusCode = 200;
    return res.end(buf);
  } catch (e) {
    return fallback();
  }
};
