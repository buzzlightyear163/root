// Same-origin token thumbnails, so the browser can compare pixels.
// ?id=<DexScreener image id>  or  ?u=<image URL on an IPFS / Arweave / DexScreener host>
const HOSTS = /^(ipfs\.io|[a-z0-9-]+\.ipfs\.io|gateway\.pinata\.cloud|[a-z0-9-]+\.mypinata\.cloud|cf-ipfs\.com|dweb\.link|[a-z0-9-]+\.ipfs\.dweb\.link|nftstorage\.link|[a-z0-9-]+\.ipfs\.nftstorage\.link|arweave\.net|[a-z0-9-]+\.arweave\.net|cdn\.dexscreener\.com|dd\.dexscreener\.com)$/i;
const MAX = 3 * 1024 * 1024;

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || '');
  const u = String((req.query && req.query.u) || '');
  let url;
  if (id) {
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) return res.status(400).end();
    url = 'https://cdn.dexscreener.com/cms/images/' + id + '?width=64&height=64&fit=crop&quality=90&format=auto';
  } else {
    try {
      const p = new URL(u);
      if (p.protocol !== 'https:' || !HOSTS.test(p.hostname)) return res.status(400).end();
      url = p.toString();
    } catch (e) {
      return res.status(400).end();
    }
  }
  try {
    const r = await fetch(url, { headers: { accept: 'image/webp,image/png,image/jpeg,image/*' }, redirect: 'follow' });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !/^image\//.test(type)) return res.status(r.ok ? 415 : r.status).end();
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX) return res.status(413).end();
    res.setHeader('content-type', type);
    res.setHeader('cache-control', 'public, max-age=86400, s-maxage=604800, immutable');
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(502).end();
  }
};
