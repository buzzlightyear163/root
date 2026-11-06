// Same-origin fallback for DexScreener's public API (no key). The browser calls DexScreener directly first;
// this only runs if that call fails, and only for the read-only paths ROOT uses.
const ALLOWED = /^\/(latest\/dex\/search\?q=|tokens\/v1\/[a-z]+\/[A-Za-z0-9,]+$|token-boosts\/top\/v1$)/;

module.exports = async (req, res) => {
  const p = String((req.query && req.query.p) || '');
  if (!ALLOWED.test(p)) return res.status(400).json({ error: 'Path not allowed.' });
  try {
    const r = await fetch('https://api.dexscreener.com' + p, { headers: { accept: 'application/json' } });
    const body = await r.text();
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', r.ok ? 'public, s-maxage=20, stale-while-revalidate=60' : 'no-store');
    return res.status(r.status).send(body);
  } catch (e) {
    return res.status(502).json({ error: 'DexScreener unreachable.' });
  }
};
