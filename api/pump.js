// pump.fun coin search, oldest first. No key. Runs on Vercel so the browser never hits pump.fun's CORS wall.
const ROUTES = [
  (q) => 'https://frontend-api-v3.pump.fun/coins?offset=0&limit=50&sort=created_timestamp&order=ASC&includeNsfw=true&searchTerm=' + q,
  (q) => 'https://frontend-api-v3.pump.fun/coins/search?offset=0&limit=50&sort=created_timestamp&order=ASC&includeNsfw=true&type=exact&searchTerm=' + q,
  (q) => 'https://frontend-api.pump.fun/coins?offset=0&limit=50&sort=created_timestamp&order=ASC&includeNsfw=true&searchTerm=' + q,
];
const HEADERS = {
  accept: 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
  origin: 'https://pump.fun',
  referer: 'https://pump.fun/',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
};

module.exports = async (req, res) => {
  const q = String((req.query && req.query.q) || '').trim().slice(0, 64);
  const debug = req.query && req.query.debug === '1';
  if (!q) return res.status(400).json({ error: 'Add ?q=<name or ticker>.' });

  const tried = [];
  for (const route of ROUTES) {
    const url = route(encodeURIComponent(q));
    try {
      const r = await fetch(url, { headers: HEADERS });
      const text = await r.text();
      tried.push({ url, status: r.status, head: debug ? text.slice(0, 160) : undefined });
      if (!r.ok) continue;
      let data;
      try { data = JSON.parse(text); } catch (e) { continue; }
      const list = Array.isArray(data) ? data : data.coins || data.data || [];
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
      if (!coins.length && !debug) continue;
      res.setHeader('cache-control', 'public, s-maxage=30, stale-while-revalidate=120');
      return res.status(200).json({ source: url.split('?')[0], coins, tried: debug ? tried : undefined });
    } catch (e) {
      tried.push({ url, error: String(e && e.message) });
    }
  }
  res.setHeader('cache-control', 'public, s-maxage=10');
  return res.status(200).json({ source: null, coins: [], tried: debug ? tried : undefined });
};
