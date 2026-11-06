// Same-origin route to Jupiter's free token search (no key). Second source next to DexScreener.
const HOSTS = ['https://lite-api.jup.ag', 'https://api.jup.ag'];

module.exports = async (req, res) => {
  const q = String((req.query && req.query.q) || '').trim().slice(0, 64);
  const debug = req.query && req.query.debug === '1';
  if (!q) return res.status(400).json({ error: 'Add ?q=<name, ticker or mint>.' });
  const tried = [];
  for (const host of HOSTS) {
    const url = host + '/tokens/v2/search?query=' + encodeURIComponent(q);
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' } });
      const text = await r.text();
      tried.push({ url, status: r.status, head: debug ? text.slice(0, 1200) : undefined });
      if (!r.ok) continue;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('cache-control', 'public, s-maxage=30, stale-while-revalidate=120');
      if (debug) return res.status(200).send(JSON.stringify({ tried, sample: JSON.parse(text).slice ? JSON.parse(text).slice(0, 3) : JSON.parse(text) }));
      return res.status(200).send(text);
    } catch (e) {
      tried.push({ url, error: String(e && e.message) });
    }
  }
  res.setHeader('cache-control', 'no-store');
  return res.status(502).json({ error: 'Jupiter unreachable.', tried: debug ? tried : undefined });
};
