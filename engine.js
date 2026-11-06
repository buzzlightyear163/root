/* ROOT engine: finds the original contract behind any name.
   DexScreener (public API, no key) + pump.fun search through /api/pump (no key). */
(function () {
  const API = 'https://api.dexscreener.com';
  const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const EVM = /^0x[a-fA-F0-9]{40}$/;

  const norm = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
  // DexScreener CMS images and pump.fun IPFS images are content-addressed: same file, same key.
  const imgKey = (url) => {
    if (!url) return null;
    const m = url.match(/\/cms\/images\/([a-f0-9]{32,})/i) || url.match(/\/ipfs\/([a-zA-Z0-9]{40,})/);
    return m ? m[1] : null;
  };

  // Direct to DexScreener first; if the browser can't reach it, go through our own /api/dex.
  let viaProxy = false;
  async function getJSON(url) {
    let r;
    if (!viaProxy) {
      try { r = await fetch(url, { headers: { accept: 'application/json' } }); } catch (e) { viaProxy = true; }
    }
    if (viaProxy) r = await fetch('/api/dex?p=' + encodeURIComponent(url.slice(API.length)));
    if (r.status === 429) throw new Error('DexScreener is rate limiting. Try again in a minute.');
    if (!r.ok) throw new Error('DexScreener answered ' + r.status + '. Try again.');
    return r.json();
  }
  const search = (q) => getJSON(API + '/latest/dex/search?q=' + encodeURIComponent(q)).then((d) => d.pairs || []);
  const tokens = (chain, addrs) => getJSON(API + '/tokens/v1/' + chain + '/' + addrs.join(',')).then((d) => (Array.isArray(d) ? d : []));
  const pump = (q) =>
    fetch('/api/pump?q=' + encodeURIComponent(q))
      .then((r) => (r.ok ? r.json() : { coins: [] }))
      .then((d) => d.coins || [])
      .catch(() => []);

  function blank(chain, address, name, symbol) {
    return {
      address, chain, name, symbol,
      image: null, keys: new Set(), firstSeen: null, liquidity: 0, volume24: 0, mcap: null,
      dexes: new Set(), pairs: new Set(), onPump: false,
      url: 'https://dexscreener.com/' + chain + '/' + address,
    };
  }

  function fold(pairs, map) {
    for (const p of pairs) {
      if (!p || !p.baseToken) continue;
      const key = p.chainId + ':' + p.baseToken.address;
      let t = map.get(key);
      if (!t) map.set(key, (t = blank(p.chainId, p.baseToken.address, p.baseToken.name, p.baseToken.symbol)));
      if (t.pairs.has(p.pairAddress)) continue;
      t.pairs.add(p.pairAddress);
      if (p.dexId) t.dexes.add(p.dexId);
      if (p.pairCreatedAt && (!t.firstSeen || p.pairCreatedAt < t.firstSeen)) t.firstSeen = p.pairCreatedAt;
      t.liquidity += (p.liquidity && p.liquidity.usd) || 0;
      t.volume24 += (p.volume && p.volume.h24) || 0;
      const mc = p.marketCap || p.fdv;
      if (mc && (!t.mcap || mc > t.mcap)) t.mcap = mc;
      const img = p.info && p.info.imageUrl;
      if (img) { if (!t.image) t.image = img; const k = imgKey(img); if (k) t.keys.add(k); }
    }
    return map;
  }

  function foldPump(coins, map) {
    for (const c of coins) {
      if (!c || !c.mint) continue;
      const key = 'solana:' + c.mint;
      let t = map.get(key);
      if (!t) map.set(key, (t = blank('solana', c.mint, c.name, c.symbol)));
      t.onPump = true;
      t.dexes.add('pumpfun');
      if (c.created && (!t.firstSeen || c.created < t.firstSeen)) t.firstSeen = c.created;
      if (c.mcap && !t.mcap) t.mcap = c.mcap;
      if (c.image) { if (!t.image) t.image = c.image; const k = imgKey(c.image); if (k) t.keys.add(k); }
    }
    return map;
  }

  function finish(t, root) {
    const shared = root && t !== root && [...t.keys].some((k) => root.keys.has(k));
    return {
      address: t.address, chain: t.chain, name: t.name, symbol: t.symbol, image: t.image,
      firstSeen: t.firstSeen, liquidity: t.liquidity || null, volume24: t.volume24 || null, mcap: t.mcap,
      dexes: [...t.dexes], pairCount: t.pairs.size, url: t.url,
      deltaMs: root && t.firstSeen && root.firstSeen ? t.firstSeen - root.firstSeen : 0,
      sameImage: !!shared,
      pumpfun: t.onPump || /pump$/.test(t.address) || t.dexes.has('pumpfun'),
    };
  }

  /**
   * find('fartcoin') | find('$WIF') | find('<contract address>')
   * Resolves { query, chain, root, copies[], otherChains[], scanned, checkedAt }.
   */
  async function find(input, opts) {
    opts = opts || {};
    const chain = 'solana';
    const step = opts.onStep || function () {};
    let q = String(input || '').trim().replace(/^\$/, '');
    if (!q) throw new Error('Type a name, a ticker or a contract address.');

    const map = new Map();
    const searched = new Set();
    const run = async (term) => {
      const k = norm(term);
      if (!k || searched.has(k)) return;
      searched.add(k);
      fold(await search(term), map);
    };

    let names, tickers, lead;
    if (B58.test(q) || EVM.test(q)) {
      step('Reading the contract');
      const pairs = await tokens(EVM.test(q) ? 'ethereum' : chain, [q]).catch(() => []);
      if (!pairs.length) throw new Error('DexScreener has no pairs for that contract yet.');
      fold(pairs, map);
      lead = pairs[0].baseToken;
    } else {
      step('Searching every ' + q);
      await run(q);
      const nq = norm(q);
      let seeds = [...map.values()].filter((t) => norm(t.symbol) === nq || norm(t.name) === nq);
      if (!seeds.length) seeds = [...map.values()].filter((t) => norm(t.symbol).includes(nq) || norm(t.name).includes(nq));
      if (!seeds.length) {
        const pc = await pump(q);
        if (pc.length) { foldPump(pc, map); seeds = [...map.values()]; }
      }
      if (!seeds.length) throw new Error('Nothing on DexScreener or pump.fun matches “' + q + '”.');
      seeds.sort((a, b) => b.liquidity - a.liquidity || (b.mcap || 0) - (a.mcap || 0));
      lead = seeds[0];
      names = new Set([nq]);
      tickers = new Set([nq]);
    }
    // One identity set: copies swap name and ticker all the time.
    const ids = new Set([...(names || []), ...(tickers || []), norm(lead.name), norm(lead.symbol)].filter(Boolean));

    step('Pulling every coin named ' + lead.name);
    await Promise.all([run(lead.symbol), run(lead.name)].map((p) => p.catch(() => {})));
    const [p1, p2] = await Promise.all([pump(lead.symbol), norm(lead.name) !== norm(lead.symbol) ? pump(lead.name) : []]);
    const inFamily = (n, s) => ids.has(norm(n)) || ids.has(norm(s));
    foldPump(p1.concat(p2).filter((c) => inFamily(c.name, c.symbol)), map);

    const family = [...map.values()].filter((t) => inFamily(t.name, t.symbol));

    // Second look: every pool DexScreener holds for each candidate, so each birth date is as early as it can be.
    step('Dating ' + family.length + ' contracts');
    const byChain = {};
    for (const t of family) (byChain[t.chain] = byChain[t.chain] || []).push(t);
    await Promise.all(Object.entries(byChain).map(async ([c, list]) => {
      for (let i = 0; i < list.length; i += 30) fold(await tokens(c, list.slice(i, i + 30).map((t) => t.address)).catch(() => []), map);
    }));

    const dated = (a, b) => (a.firstSeen || Infinity) - (b.firstSeen || Infinity);
    const local = family.filter((t) => t.chain === chain && t.firstSeen).sort(dated);
    const other = family.filter((t) => t.chain !== chain && t.firstSeen).sort(dated);
    if (!local.length) {
      const where = [...new Set(other.map((t) => t.chain))].join(', ');
      throw new Error('No Solana contract carries that name' + (where ? '. Found it on ' + where + '.' : '.'));
    }
    const root = local[0];
    return {
      query: q, chain, checkedAt: Date.now(), scanned: map.size,
      root: finish(root, root),
      copies: local.slice(1).map((t) => finish(t, root)),
      otherChains: other.map((t) => finish(t, root)),
    };
  }

  /** The runners DexScreener is being paid to push right now (Solana only). */
  async function runners(limit) {
    const boosts = await getJSON(API + '/token-boosts/top/v1');
    const seen = new Set();
    const sol = (Array.isArray(boosts) ? boosts : []).filter((b) => b.chainId === 'solana' && !seen.has(b.tokenAddress) && seen.add(b.tokenAddress)).slice(0, limit || 6);
    return sol.map((b) => ({ address: b.tokenAddress, icon: b.icon ? 'https://cdn.dexscreener.com/cms/images/' + b.icon : null }));
  }

  // Real DexScreener snapshot (search "fartcoin", 6 Nov 2026): the page shows a result before anyone types.
  const R0 = 1729231787000;
  const demo = {
    query: 'fartcoin', chain: 'solana', checkedAt: 1794000000000, scanned: 30,
    root: { address: '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump', chain: 'solana', name: 'Fartcoin', symbol: 'Fartcoin',
      image: 'https://cdn.dexscreener.com/cms/images/9af5672845c89585e9ff1e3b26a640090324aa4d92222052d1043e60ef8182de?width=800&height=800&quality=95&format=auto',
      firstSeen: R0, liquidity: 9015014, volume24: null, mcap: 143082978, dexes: ['raydium', 'orca', 'meteora', 'pumpswap'], pairCount: 23,
      url: 'https://dexscreener.com/solana/9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump', deltaMs: 0, sameImage: false, pumpfun: true },
    copies: [
      { address: '3srC8ksB2EiJynMGfk72mDk7joF56Aqz3NjwQEyEki7c', chain: 'solana', name: 'Fartcoin Token', symbol: 'Fartcoin', image: null, firstSeen: 1756904044000,
        liquidity: 243378628, mcap: 633540161, dexes: ['raydium'], pairCount: 1, url: 'https://dexscreener.com/solana/3srC8ksB2EiJynMGfk72mDk7joF56Aqz3NjwQEyEki7c',
        deltaMs: 1756904044000 - R0, sameImage: false, pumpfun: false },
      { address: 'HnXDnwTa68tRhLRZdJkVRLAeYrUkCYgFgDavtwD1pump', chain: 'solana', name: 'Fartcoin', symbol: 'Fartcoin', image: null, firstSeen: 1764248812000,
        liquidity: 45556, mcap: 133449, dexes: ['pumpswap'], pairCount: 1, url: 'https://dexscreener.com/solana/HnXDnwTa68tRhLRZdJkVRLAeYrUkCYgFgDavtwD1pump',
        deltaMs: 1764248812000 - R0, sameImage: false, pumpfun: true },
    ],
    otherChains: [
      { address: '0x2f6c17fa9f9bC3600346ab4e48C0701e1d5962AE', chain: 'base', name: 'Based Fartcoin', symbol: 'Fartcoin', firstSeen: 1734325313000, mcap: 359462, url: 'https://dexscreener.com/base/0x2f6c17fa9f9bC3600346ab4e48C0701e1d5962AE', deltaMs: 1734325313000 - R0 },
      { address: '0x22f0dc0A91D263e8b94087C3769aE9953E9529c1', chain: 'bsc', name: 'Fartcoin', symbol: 'Fartcoin', firstSeen: 1742602398000, mcap: 7469, url: 'https://dexscreener.com/bsc/0x22f0dc0A91D263e8b94087C3769aE9953E9529c1', deltaMs: 1742602398000 - R0 },
      { address: '0x1e8E148055cbD5A02ea75EEd79da7Ce4B91108B9', chain: 'ethereum', name: 'Fartcoin', symbol: 'FART', firstSeen: 1750603871000, mcap: 100872, url: 'https://dexscreener.com/ethereum/0x1e8E148055cbD5A02ea75EEd79da7Ce4B91108B9', deltaMs: 1750603871000 - R0 },
      { address: '0x8237b29772E4ADfa823fd22422d4E42B6161e81e', chain: 'ethereum', name: 'Fartcoin', symbol: 'FARTCOIN', firstSeen: 1789429619000, mcap: 93429747, url: 'https://dexscreener.com/ethereum/0x8237b29772E4ADfa823fd22422d4E42B6161e81e', deltaMs: 1789429619000 - R0 },
      { address: '0xf595E4017918bB33B7C4F091a3D29A5AF0C43904', chain: 'robinhood', name: 'fartcoin', symbol: 'fartcoin', firstSeen: 1792395489000, mcap: 12818, url: 'https://dexscreener.com/robinhood/0xf595E4017918bB33B7C4F091a3D29A5AF0C43904', deltaMs: 1792395489000 - R0 },
    ],
  };

  const fmt = {
    short: (a) => (a ? a.slice(0, 4) + '…' + a.slice(-4) : ''),
    usd: (n) => (n == null ? '—' : n >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? '$' + (n / 1e3).toFixed(1) + 'K' : '$' + Math.round(n)),
    delta: (ms) => {
      if (!ms || ms < 0) return '0';
      const s = ms / 1000, m = s / 60, h = m / 60, d = h / 24;
      if (s < 60) return '+' + Math.round(s) + 's';
      if (m < 60) return '+' + Math.round(m) + 'm';
      if (h < 48) return '+' + Math.round(h) + 'h';
      if (d < 365) return '+' + Math.round(d) + 'd';
      return '+' + (d / 365).toFixed(1) + 'y';
    },
    date: (ms) => (ms ? new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : 'unknown'),
    day: (ms) => (ms ? new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'unknown'),
  };

  window.ROOT = { find, runners, demo, fmt, norm };
})();
