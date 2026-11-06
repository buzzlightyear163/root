// Same-origin thumbnails of DexScreener token images, so the browser can compare pixels.
// Only cdn.dexscreener.com/cms/images/<id> is allowed.
module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || '');
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) return res.status(400).end();
  try {
    const r = await fetch('https://cdn.dexscreener.com/cms/images/' + id + '?width=64&height=64&fit=crop&quality=90&format=auto', {
      headers: { accept: 'image/webp,image/png,image/*' },
    });
    if (!r.ok) return res.status(r.status).end();
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('content-type', r.headers.get('content-type') || 'image/webp');
    res.setHeader('cache-control', 'public, max-age=86400, s-maxage=604800, immutable');
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(502).end();
  }
};
