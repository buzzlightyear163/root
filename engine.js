/* ROOT engine: finds the original contract behind any name.
   Two free sources, no keys: DexScreener (pools, pump.fun curve included) and Jupiter (every mint, holders, dev).
   Runs in the browser and in Vercel functions. */
(function (G) {
  const DEX = 'https://api.dexscreener.com';
  const JUP = 'https://lite-api.jup.ag/tokens/v2/search?query=';
  const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const EVM = /^0x[a-fA-F0-9]{40}$/;
  const inBrowser = typeof document !== 'undefined';

  const norm = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
  const imgId = (url) => {
    const m = url && url.match(/\/cms\/images\/([A-Za-z0-9_-]{8,80})/);
    return m ? m[1] : null;
  };

  // Direct first. If the browser can't reach a source, go through our own same-origin route.
  const proxied = { dex: false, jup: false };
  async function getJSON(direct, proxy, key, label) {
    let r;
    if (!proxied[key]) {
      try { r = await fetch(direct, { headers: { accept: 'application/json' } }); } catch (e) { if (!proxy) throw e; proxied[key] = true; }
    }
    if (proxied[key]) r = await fetch(proxy);
    if (r.status === 429) throw new Error(label + ' is rate limiting. Try again in a minute.');
    if (!r.ok) throw new Error(label + ' answered ' + r.status + '. Try again.');
    return r.json();
  }
  const dexGet = (path) => getJSON(DEX + path, inBrowser ? '/api/dex?p=' + encodeURIComponent(path) : null, 'dex', 'DexScreener');
  const search = (q) => dexGet('/latest/dex/search?q=' + encodeURIComponent(q)).then((d) => d.pairs || []);
  const tokens = (chain, addrs) => dexGet('/tokens/v1/' + chain + '/' + addrs.join(',')).then((d) => (Array.isArray(d) ? d : []));
  const jup = (q) =>
    getJSON(JUP + encodeURIComponent(q), inBrowser ? '/api/jup?q=' + encodeURIComponent(q) : null, 'jup', 'Jupiter')
      .then((d) => (Array.isArray(d) ? d : []))
      .catch(() => []);

  function blank(chain, address, name, symbol) {
    return {
      address, chain, name: (name || '').trim(), symbol: (symbol || '').trim(),
      image: null, firstSeen: null, liquidity: 0, volume24: 0, mcap: null, topLiq: -1,
      holders: null, jupMcap: null, jupLiq: null, dev: null, verified: false, twitter: null, launchpad: null,
      dexes: new Set(), pairs: new Set(),
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
      const liq = (p.liquidity && p.liquidity.usd) || 0;
      t.liquidity += liq;
      t.volume24 += (p.volume && p.volume.h24) || 0;
      // Market cap from the deepest pool: thin pools with odd quote tokens report nonsense.
      const mc = p.marketCap || p.fdv;
      if (mc && (t.mcap == null || liq > t.topLiq)) { t.mcap = mc; t.topLiq = liq; }
      const img = p.info && p.info.imageUrl;
      if (img && !t.image) t.image = img;
      const x = p.info && (p.info.socials || []).find((s) => s.type === 'twitter');
      if (x && !t.twitter) t.twitter = x.url;
    }
    return map;
  }

  function foldJup(list, map) {
    for (const j of list) {
      if (!j || !j.id) continue;
      const key = 'solana:' + j.id;
      let t = map.get(key);
      if (!t) map.set(key, (t = blank('solana', j.id, j.name, j.symbol)));
      const born = Date.parse(j.createdAt || (j.firstPool && j.firstPool.createdAt) || '') || null;
      if (born && (!t.firstSeen || born < t.firstSeen)) t.firstSeen = born;
      if (j.holderCount != null) t.holders = j.holderCount;
      if (j.mcap) t.jupMcap = j.mcap;
      if (j.liquidity) t.jupLiq = j.liquidity;
      if (j.icon && !t.image) t.image = j.icon;
      if (j.dev) t.dev = j.dev;
      if (j.isVerified) t.verified = true;
      if (j.twitter && !t.twitter) t.twitter = j.twitter;
      if (j.launchpad) t.launchpad = j.launchpad;
    }
    return map;
  }

  const mcapOf = (t) => t.jupMcap || t.mcap || null;
  const liqOf = (t) => t.liquidity || t.jupLiq || null;
  // A contract "ran" if people actually showed up. Older contracts that never ran don't get to be the root.
  const ran = (t) => (t.holders || 0) >= 100 || (mcapOf(t) || 0) >= 25000 || (liqOf(t) || 0) >= 5000;

  function finish(t, root) {
    return {
      address: t.address, chain: t.chain, name: t.name, symbol: t.symbol, image: t.image,
      firstSeen: t.firstSeen, liquidity: liqOf(t), volume24: t.volume24 || null, mcap: mcapOf(t),
      holders: t.holders, dev: t.dev, verified: t.verified, twitter: t.twitter,
      dexes: [...t.dexes], pairCount: t.pairs.size, url: t.url,
      deltaMs: root && t.firstSeen && root.firstSeen ? t.firstSeen - root.firstSeen : 0,
      sameImage: !!(root && t !== root && imgId(t.image) && imgId(t.image) === imgId(root.image)),
      sameDev: !!(root && t !== root && t.dev && t.dev === root.dev),
      pumpfun: t.launchpad === 'pump.fun' || /pump$/.test(t.address) || t.dexes.has('pumpfun'),
    };
  }

  /**
   * find('fartcoin') | find('$WIF') | find('<contract address>')
   * Resolves { query, chain, root, copies[], dormant[], otherChains[], scanned, checkedAt }.
   * opts.quick: fewer requests (used for the engine list).
   */
  async function find(input, opts) {
    opts = opts || {};
    const chain = 'solana';
    const step = opts.onStep || function () {};
    let q = String(input || '').trim().replace(/^\$/, '');
    if (!q) throw new Error('Type a name, a ticker or a contract address.');

    const map = new Map();
    const searchedDex = new Set();
    const searchedJup = new Set();
    const runDex = async (term) => {
      const k = norm(term);
      if (!k || searchedDex.has(k)) return;
      searchedDex.add(k);
      fold(await search(term), map);
    };
    const runJup = async (term) => {
      const k = norm(term);
      if (!k || searchedJup.has(k)) return;
      searchedJup.add(k);
      foldJup(await jup(term), map);
    };

    let lead;
    const ids = new Set();
    if (B58.test(q) || EVM.test(q)) {
      step('Reading the contract');
      const [pairs, jl] = await Promise.all([tokens(EVM.test(q) ? 'ethereum' : chain, [q]).catch(() => []), EVM.test(q) ? [] : jup(q)]);
      fold(pairs, map);
      foldJup(jl.filter((j) => j.id === q), map);
      const hit = map.get(chain + ':' + q) || (pairs[0] && map.get(pairs[0].chainId + ':' + pairs[0].baseToken.address));
      if (!hit) throw new Error('Neither DexScreener nor Jupiter knows that contract yet.');
      lead = hit;
    } else {
      step('Searching every ' + q);
      await Promise.all([runDex(q), runJup(q)]);
      const nq = norm(q);
      ids.add(nq);
      let seeds = [...map.values()].filter((t) => norm(t.symbol) === nq || norm(t.name) === nq);
      if (!seeds.length) seeds = [...map.values()].filter((t) => norm(t.symbol).includes(nq) || norm(t.name).includes(nq));
      if (!seeds.length) throw new Error('Nothing on DexScreener or Jupiter matches “' + q + '”.');
      seeds.sort((a, b) => (liqOf(b) || 0) - (liqOf(a) || 0) || (b.holders || 0) - (a.holders || 0));
      lead = seeds[0];
    }
    // One identity set: copies swap name and ticker all the time.
    ids.add(norm(lead.name));
    ids.add(norm(lead.symbol));
    ids.delete('');

    step('Pulling every coin named ' + lead.name);
    const more = opts.quick ? [runDex(lead.symbol), runJup(lead.symbol)] : [runDex(lead.symbol), runDex(lead.name), runJup(lead.symbol), runJup(lead.name)];
    await Promise.all(more.map((p) => p.catch(() => {})));
    const inFamily = (t) => ids.has(norm(t.name)) || ids.has(norm(t.symbol));
    const family = [...map.values()].filter(inFamily);

    // Second look: every pool DexScreener holds for each candidate, so each birth is as early as it can be.
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
    let at = local.findIndex(ran);
    if (at < 0) at = 0;
    const root = local[at];
    return {
      query: q, chain, checkedAt: Date.now(), scanned: map.size,
      root: finish(root, root),
      copies: local.slice(at + 1).map((t) => finish(t, root)),
      dormant: local.slice(0, at).map((t) => finish(t, root)),
      otherChains: other.map((t) => finish(t, root)),
    };
  }

  /* Same picture: 64-bit difference hash of each thumbnail, fetched same-origin through /api/img. */
  function hashImage(url) {
    if (!url || !inBrowser) return Promise.resolve(null);
    const id = imgId(url);
    const src = id ? '/api/img?id=' + encodeURIComponent(id) : '/api/img?u=' + encodeURIComponent(url);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas'); c.width = 9; c.height = 8;
          const g = c.getContext('2d'); g.drawImage(img, 0, 0, 9, 8);
          const d = g.getImageData(0, 0, 9, 8).data;
          const lum = (i) => d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
          let bits = '';
          for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const i = (y * 9 + x) * 4; bits += lum(i) > lum(i + 4) ? '1' : '0'; }
          resolve(bits);
        } catch (e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
  /** Flags copies whose picture matches the root's. Calls onMatch(copy) for each one. */
  async function matchImages(r, onMatch) {
    const base = await hashImage(r.root.image);
    if (!base) return;
    for (const c of r.copies.slice(0, 40)) {
      if (c.sameImage) { onMatch(c); continue; }
      if (!c.image) continue;
      const h = await hashImage(c.image);
      if (!h) continue;
      let diff = 0;
      for (let i = 0; i < 64; i++) if (h[i] !== base[i]) diff++;
      if (diff <= 10) { c.sameImage = true; onMatch(c); }
    }
  }

  /** The runners DexScreener is being paid to push right now (Solana only). */
  async function runners(limit) {
    const boosts = await dexGet('/token-boosts/top/v1');
    const seen = new Set();
    const sol = (Array.isArray(boosts) ? boosts : []).filter((b) => b.chainId === 'solana' && !seen.has(b.tokenAddress) && seen.add(b.tokenAddress)).slice(0, limit || 5);
    return sol.map((b) => ({ address: b.tokenAddress, icon: b.icon ? (/^https?:/.test(b.icon) ? b.icon : 'https://cdn.dexscreener.com/cms/images/' + b.icon) : null }));
  }

  // Real snapshot (DexScreener + Jupiter, search "fartcoin", 6 Nov 2026): the page shows a result before anyone types.
  const R0 = Date.parse('2024-10-18T06:05:05Z');
  const demo = {
    query: 'fartcoin', chain: 'solana', checkedAt: Date.parse('2026-11-06T15:37:00Z'), scanned: 31, dormant: [],
    root: { address: '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump', chain: 'solana', name: 'Fartcoin', symbol: 'Fartcoin',
      image: 'https://cdn.dexscreener.com/cms/images/9af5672845c89585e9ff1e3b26a640090324aa4d92222052d1043e60ef8182de?width=800&height=800&quality=95&format=auto',
      firstSeen: R0, liquidity: 9015014, mcap: 119120872, holders: 193231, verified: true, twitter: 'https://x.com/FartCoinOfSOL',
      dexes: ['pumpfun', 'raydium', 'orca', 'meteora', 'pumpswap'], pairCount: 23,
      url: 'https://dexscreener.com/solana/9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump', deltaMs: 0, sameImage: false, pumpfun: true },
    copies: [
      { address: '3srC8ksB2EiJynMGfk72mDk7joF56Aqz3NjwQEyEki7c', chain: 'solana', name: 'Fartcoin Token', symbol: 'Fartcoin', image: null, firstSeen: 1756904044000,
        liquidity: 243378628, mcap: 633540161, holders: null, dexes: ['raydium'], pairCount: 1, url: 'https://dexscreener.com/solana/3srC8ksB2EiJynMGfk72mDk7joF56Aqz3NjwQEyEki7c',
        deltaMs: 1756904044000 - R0, sameImage: false, pumpfun: false },
      { address: 'HnXDnwTa68tRhLRZdJkVRLAeYrUkCYgFgDavtwD1pump', chain: 'solana', name: 'Fartcoin', symbol: 'Fartcoin', image: null, firstSeen: Date.parse('2025-11-27T03:42:38Z'),
        liquidity: 31165, mcap: 69963, holders: 758, dexes: ['pumpfun', 'pumpswap'], pairCount: 1, url: 'https://dexscreener.com/solana/HnXDnwTa68tRhLRZdJkVRLAeYrUkCYgFgDavtwD1pump',
        deltaMs: Date.parse('2025-11-27T03:42:38Z') - R0, sameImage: false, pumpfun: true },
      { address: 'EZU9h2ZMB9t5REotsZarm4VhGRA9tTvfSf8GFhNmpump', chain: 'solana', name: 'Fartcoin', symbol: 'Fartcoin', image: null, firstSeen: Date.parse('2026-11-05T21:53:39Z'),
        liquidity: 3408, mcap: 3180, holders: 2, dexes: ['pumpfun'], pairCount: 0, url: 'https://dexscreener.com/solana/EZU9h2ZMB9t5REotsZarm4VhGRA9tTvfSf8GFhNmpump',
        deltaMs: Date.parse('2026-11-05T21:53:39Z') - R0, sameImage: false, pumpfun: true },
    ],
    otherChains: [
      { address: '0x2f6c17fa9f9bC3600346ab4e48C0701e1d5962AE', chain: 'base', name: 'Based Fartcoin', symbol: 'Fartcoin', firstSeen: 1734325313000, mcap: 308145, url: 'https://dexscreener.com/base/0x2f6c17fa9f9bC3600346ab4e48C0701e1d5962AE', deltaMs: 1734325313000 - R0 },
      { address: '0x22f0dc0A91D263e8b94087C3769aE9953E9529c1', chain: 'bsc', name: 'Fartcoin', symbol: 'Fartcoin', firstSeen: 1742602398000, mcap: 7469, url: 'https://dexscreener.com/bsc/0x22f0dc0A91D263e8b94087C3769aE9953E9529c1', deltaMs: 1742602398000 - R0 },
      { address: '0x1e8E148055cbD5A02ea75EEd79da7Ce4B91108B9', chain: 'ethereum', name: 'Fartcoin', symbol: 'FART', firstSeen: 1750603871000, mcap: 100872, url: 'https://dexscreener.com/ethereum/0x1e8E148055cbD5A02ea75EEd79da7Ce4B91108B9', deltaMs: 1750603871000 - R0 },
      { address: '0xf595E4017918bB33B7C4F091a3D29A5AF0C43904', chain: 'robinhood', name: 'fartcoin', symbol: 'fartcoin', firstSeen: 1792395489000, mcap: 12818, url: 'https://dexscreener.com/robinhood/0xf595E4017918bB33B7C4F091a3D29A5AF0C43904', deltaMs: 1792395489000 - R0 },
    ],
  };

  const fmt = {
    short: (a) => (a ? a.slice(0, 4) + '…' + a.slice(-4) : ''),
    usd: (n) => (n == null ? '—' : n >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? '$' + (n / 1e3).toFixed(1) + 'K' : '$' + Math.round(n)),
    num: (n) => (n == null ? '—' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'K' : n.toLocaleString('en-US')),
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

  G.ROOT = { find, runners, matchImages, demo, fmt, norm };
})(typeof window !== 'undefined' ? window : globalThis);
