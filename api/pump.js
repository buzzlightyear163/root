// pump.fun coin search, oldest first. No key. Runs on Vercel so the browser never hits pump.fun's CORS wall.
const HOSTS = ['https://frontend-api-v3.pump.fun', 'https://frontend-api.pump.fun'];

module.exports = async (req, res) => {
  const q = String((req.query && req.query.q) || '').trim().slice(0, 64);
  if (!q) return res.status(400).json({ error: 'Add ?q=<name or ticker>.' });

  for (const host of HOSTS) {
    const url = host + '/coins?offset=0&limit=50&sort=created_timestamp&order=ASC&includeNsfw=true&searchTerm=' + encodeURIComponent(q);
    try {
      const r = await fetch(url, {
        headers: {
          accept: 'application/json',
          origin: 'https://pump.fun',
          referer: 'https://pump.fun/',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
        },
      });
      if (!r.ok) continue;
      const data = await r.json();
      const list = Array.isArray(data) ? data : data.coins || [];
      const coins = list
        .filter((c) => c && c.mint)
        .map((c) => ({
          mint: c.mint,
          name: c.name,
          symbol: c.symbol,
          created: Number(c.created_timestamp) || null,
          image: c.image_uri || null,
          mcap: c.usd_market_cap || null,
          graduated: !!c.complete,
        }));
      res.setHeader('cache-control', 'public, s-maxage=30, stale-while-revalidate=120');
      return res.status(200).json({ source: host, coins });
    } catch (e) {
      // try the next host
    }
  }
  res.setHeader('cache-control', 'public, s-maxage=10');
  return res.status(200).json({ source: null, coins: [] });
};
