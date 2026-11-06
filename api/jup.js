// Same-origin fallback for Jupiter's free token search (no key). The browser calls Jupiter directly first.
const HOSTS = ['https://lite-api.jup.ag', 'https://api.jup.ag'];

module.exports = async (req, res) => {
  const q = String((req.query && req.query.q) || '').trim().slice(0, 64);
  if (!q) return res.status(400).json({ error: 'Add ?q=<name, ticker or mint>.' });
  for (const host of HOSTS) {
    try {
      const r = await fetch(host + '/tokens/v2/search?query=' + encodeURIComponent(q), { headers: { accept: 'application/json' } });
      if (!r.ok) continue;
      const body = await r.text();
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('cache-control', 'public, s-maxage=30, stale-while-revalidate=120');
      return res.status(200).send(body);
    } catch (e) {
      // next host
    }
  }
  res.setHeader('cache-control', 'no-store');
  return res.status(502).json({ error: 'Jupiter unreachable.' });
};
