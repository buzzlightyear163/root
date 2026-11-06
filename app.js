/* ROOT site. Fill in SITE when $ROOT is live. */
const SITE = {
  ca: '',   // $ROOT contract address. Empty = the contract row stays hidden.
  x: '',    // X profile URL, e.g. https://x.com/yourhandle
};

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const { fmt } = ROOT;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- site config ---------- */
if (SITE.ca) {
  $('#ca').textContent = SITE.ca;
  $('#ca-row').hidden = false;
  $$('[data-buy]').forEach((a) => (a.href = 'https://pump.fun/coin/' + SITE.ca));
  $('#chart').href = 'https://dexscreener.com/solana/' + SITE.ca;
  $('#copy-ca').addEventListener('click', (e) => copyText(SITE.ca, e.currentTarget));
}
if (SITE.x) { $('#xlink').href = SITE.x; $('#xlink').hidden = false; }

function copyText(text, btn) {
  const done = () => { const t = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = t), 1600); };
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done); else done();
}

/* ---------- microprinting ---------- */
$$('[data-micro]').forEach((el) => { el.textContent = el.dataset.micro.repeat(60); });

/* ---------- guilloche ---------- */
function plate(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0;
  const size = () => {
    const r = canvas.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
    W = r.width; canvas.width = r.width * d; canvas.height = r.height * d; ctx.setTransform(d, 0, 0, d, 0, 0);
  };
  function band(R, from, to, n, lobes, amp, twist, t, alpha, steps) {
    for (let j = 0; j < n; j++) {
      const k = j / (n - 1), base = R * (from + (to - from) * k);
      ctx.globalAlpha = alpha * (0.55 + 0.45 * Math.sin(Math.PI * k));
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const th = (i / steps) * Math.PI * 2;
        const r = base + R * amp * Math.sin(lobes * th + j * twist + t) + R * amp * 0.45 * Math.sin((lobes / 3) * th - t * 0.7 + j * 0.05);
        const x = W / 2 + r * Math.cos(th), y = W / 2 + r * Math.sin(th);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  }
  function draw(t, a, b, rings) {
    const R = (W / 2) * 0.96;
    ctx.clearRect(0, 0, W, W);
    ctx.lineWidth = Math.max(0.5, W / 1100);
    ctx.strokeStyle = '#2B3FD4'; band(R, 0.8, 0.97, rings ? 26 : 18, 30, 0.028, 0.12, t + a, 0.9, 620);
    ctx.strokeStyle = '#0E1C4F'; band(R, 0.58, 0.76, rings ? 22 : 15, 15, 0.035, -0.16, -t * 1.3 + b, 0.55, 520);
    ctx.strokeStyle = '#2B3FD4'; band(R, 0.4, 0.52, rings ? 16 : 12, 9, 0.03, 0.2, t * 0.8, 0.7, 380);
    ctx.globalAlpha = 1;
  }
  return { size, draw };
}

function engrave(c) {
  const r = c.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
  if (!r.width) return;
  c.width = r.width * d; c.height = r.height * d;
  const g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.lineWidth = 0.7;
  for (let j = 0; j < 14; j++) {
    g.strokeStyle = j % 2 ? '#2B3FD4' : '#0E1C4F'; g.globalAlpha = 0.35 + (j % 3) * 0.15; g.beginPath();
    for (let x = 0; x <= r.width; x += 2) {
      const y = r.height / 2 + Math.sin(x / 9 + j * 0.45) * (r.height * 0.32) * Math.cos(x / 140 + j * 0.08);
      x ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
  }
}

const hero = plate($('#rosette'));
const seal = plate($('#seal'));
let phase = 0, px = 0, py = 0, heroVisible = true;
const redrawAll = () => { hero.size(); hero.draw(phase, px, py, true); seal.size(); seal.draw(0.6, 0, 0, false); $$('.engrave').forEach(engrave); };
redrawAll();
new IntersectionObserver(([e]) => (heroVisible = e.isIntersecting)).observe($('#rosette'));
let last = 0;
function loop(ts) {
  if (heroVisible && ts - last > 40) { phase += 0.006; hero.draw(phase, px, py, true); last = ts; }
  requestAnimationFrame(loop);
}
if (!reduce) requestAnimationFrame(loop);
addEventListener('pointermove', (e) => {
  const x = e.clientX / innerWidth, y = e.clientY / innerHeight;
  document.documentElement.style.setProperty('--fy', (y * 100).toFixed(1) + '%');
  px = (x - 0.5) * 0.6; py = (y - 0.5) * 0.6;
  if (reduce) hero.draw(phase, px, py, true);
}, { passive: true });

/* ---------- result ---------- */
function pic(t) {
  const letter = esc((t.symbol || t.name || '?').replace(/^\$/, '').charAt(0).toUpperCase());
  return t.image ? `<img src="${esc(t.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-letter="${letter}">` : `<b>${letter}</b>`;
}
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName === 'IMG' && img.dataset.letter) img.replaceWith(Object.assign(document.createElement('b'), { textContent: img.dataset.letter }));
}, true);

const SHOW = 8;
function copyRow(c, root) {
  const bigger = c.mcap && root.mcap && c.mcap > root.mcap;
  return `<div class="copy" data-a="${esc(c.address)}">
    <div class="row"><b>${esc(c.name)}</b><span class="when">${fmt.delta(c.deltaMs)} after</span></div>
    <div class="row"><code>${fmt.short(c.address)}</code><a href="${esc(c.url)}" target="_blank" rel="noopener">${c.mcap ? fmt.usd(c.mcap) + ' mcap' : 'DexScreener'}</a></div>
    ${c.sameImage ? '<p class="warn clone">Same picture as the root. Straight clone.</p>' : ''}
    ${bigger ? '<p class="warn">Shows a bigger market cap than the root. Still a copy.</p>' : ''}
    <span class="stamp" aria-hidden="true">COPY</span>
  </div>`;
}

function renderResult(r) {
  const root = r.root, n = r.copies.length;
  $('#portrait').innerHTML = pic(root);
  $('#cap').textContent = `The root of ${root.name}. First seen ${fmt.date(root.firstSeen)}.`;
  const chains = [...new Set(r.otherChains.map((c) => c.chain))];
  $('#result').innerHTML = `
    <h2>${esc(root.name)} has one root and ${n ? n + (n === 1 ? ' copy' : ' copies') : 'no copies'} on Solana.</h2>
    <div class="grid">
      <article class="note">
        <canvas class="engrave" aria-hidden="true"></canvas>
        <div class="note-body">
          <div class="pic">${pic(root)}</div>
          <div>
            <h3>${esc(root.name)}</h3>
            <p class="sym">$${esc(root.symbol)}${root.pumpfun ? ', born on pump.fun' : ''}</p>
            <code class="serialno">${esc(root.address)}</code>
          </div>
        </div>
        <dl class="facts">
          <div><dt>First seen (UTC)</dt><dd>${fmt.date(root.firstSeen).replace(' UTC', '')}</dd></div>
          <div><dt>Pools</dt><dd>${root.pairCount || '—'}</dd></div>
          <div><dt>Liquidity</dt><dd>${fmt.usd(root.liquidity)}</dd></div>
          <div><dt>Market cap</dt><dd>${fmt.usd(root.mcap)}</dd></div>
        </dl>
        <div class="acts">
          <button class="btn" type="button" id="copy-root">Copy contract</button>
          <a class="btn ghost" href="${esc(root.url)}" target="_blank" rel="noopener">Open on DexScreener</a>
          ${root.pumpfun ? `<a class="btn ghost" href="https://pump.fun/coin/${esc(root.address)}" target="_blank" rel="noopener">pump.fun</a>` : ''}
        </div>
      </article>
      <div class="copies">
        <h3>Copies, oldest first</h3>
        <p>Same name or ticker, minted after the root.</p>
        <div id="copy-list">${n ? r.copies.slice(0, SHOW).map((c) => copyRow(c, root)).join('') : '<p class="none">Nothing else on Solana carries this name yet.</p>'}</div>
        ${n > SHOW ? `<button class="more" type="button" id="more">Show all ${n} copies</button>` : ''}
        ${r.otherChains.length ? `<p class="elsewhere">${r.otherChains.length} more on ${esc(chains.join(', '))}. Other chains are listed in the lineage, never bought.</p>` : ''}
      </div>
    </div>`;
  engrave($('#result .engrave'));
  $('#copy-root').addEventListener('click', (e) => copyText(root.address, e.currentTarget));
  const more = $('#more');
  if (more) more.addEventListener('click', () => { $('#copy-list').innerHTML = r.copies.map((c) => copyRow(c, root)).join(''); more.remove(); });
  ROOT.matchImages(r, (c) => {
    const row = $(`.copy[data-a="${CSS.escape(c.address)}"]`);
    if (row && !row.querySelector('.clone')) row.querySelector('.row:nth-child(2)').insertAdjacentHTML('afterend', '<p class="warn clone">Same picture as the root. Straight clone.</p>');
  }).catch(() => {});
}

/* ---------- lineage: time after the root, log scale ---------- */
const HI = 8.1, X0 = 0.07;
const xOf = (ms) => X0 + (1 - X0) * Math.min(1, Math.log10(Math.max(1, ms / 1000)) / HI);
const TICKS = [[1, '1s'], [60, '1m'], [3600, '1h'], [86400, '1d'], [604800, '1w'], [2592000, '30d'], [31536000, '1y']];

function renderField(r, animate) {
  const f = $('#field'), w = f.clientWidth, narrow = w < 700;
  const pts = [...r.copies.map((c) => ({ ...c, far: false })), ...r.otherChains.map((c) => ({ ...c, far: true }))]
    .filter((c) => c.deltaMs > 0).sort((a, b) => a.deltaMs - b.deltaMs).slice(0, 80);
  const lanes = [], gap = narrow ? 70 : 118, maxLanes = narrow ? 3 : 4;
  pts.forEach((p) => {
    p.x = xOf(p.deltaMs) * (w - 24) + 12;
    let lane = 0; while (lane < maxLanes && lanes[lane] != null && p.x - lanes[lane] < gap) lane++;
    if (lane < maxLanes) { lanes[lane] = p.x; p.lane = lane; } else p.lane = -1;
  });
  const solana = r.copies.length;
  $('#lineage-note').textContent = solana
    ? `${r.root.name}: the first copy on Solana arrived ${fmt.delta(r.copies[0].deltaMs).slice(1)} after the root. Time on a log scale. Solid rings are Solana copies, dashed rings carry the name on other chains.`
    : `Nothing on Solana has copied ${r.root.name} yet. Time on a log scale. Dashed rings carry the name on other chains.`;
  f.innerHTML = `
    <div class="axis"></div>
    ${TICKS.filter(([s]) => !narrow || [60, 3600, 86400, 2592000, 31536000].includes(s)).map(([s, l]) => `<span class="tick" style="left:${(xOf(s * 1000) * (w - 24) + 12).toFixed(1)}px">${l}</span>`).join('')}
    <div class="zero"><div class="dot"></div><div class="lab"><b>${esc(r.root.name)}</b><span>The root, ${fmt.day(r.root.firstSeen)}</span></div></div>
    ${pts.map((p) => {
      const h = 34 + (Math.max(0, p.lane) % 4) * 50;
      const label = narrow ? (p.far ? p.chain : 'solana') : p.name + (p.far ? ' on ' + p.chain : '');
      return `<div class="e ${p.far ? 'far' : ''}" style="left:${p.x.toFixed(1)}px;bottom:56px" title="${esc(p.name)}, ${fmt.delta(p.deltaMs)} after the root">
        <div class="ring"></div>
        ${p.lane >= 0 ? `<div class="stem" style="height:${h - 16}px"></div><div class="tag" style="bottom:${h}px"><b>${fmt.delta(p.deltaMs)}</b>${esc(label)}</div>` : ''}
      </div>`;
    }).join('')}
    ${pts.length ? '' : '<p class="field-empty">No copies yet. Just the root.</p>'}`;
  const es = $$('.e', f);
  if (!animate || reduce) es.forEach((e) => e.classList.add('on', 'still'));
  else {
    es.forEach((e) => e.classList.remove('on'));
    const fire = () => es.forEach((e, i) => setTimeout(() => e.classList.add('on'), 200 + i * 160));
    const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) { fire(); io.disconnect(); } }, { threshold: 0.35 });
    io.observe(f);
  }
}

/* ---------- search ---------- */
let current = ROOT.demo;
function render(r, animate) { current = r; renderResult(r); renderField(r, animate); }

async function go(q, opts) {
  const st = $('#status'), btn = $('#find .btn');
  st.className = 'status';
  btn.disabled = true;
  try {
    const r = await ROOT.find(q, { onStep: (s) => (st.textContent = s + '…') });
    st.textContent = `Checked ${r.scanned} contracts. Root found.`;
    render(r, true);
    const u = new URL(location.href); u.searchParams.set('q', q); history.replaceState(null, '', u);
    if (!(opts && opts.stay)) $('#result').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  } catch (e) {
    st.className = 'status err';
    st.textContent = e && e.message && !/fetch/i.test(e.message) ? e.message : 'Could not reach DexScreener. Check your connection and try again.';
  } finally { btn.disabled = false; }
}
$('#find').addEventListener('submit', (e) => { e.preventDefault(); go($('#q').value); });
$$('[data-q]').forEach((b) => b.addEventListener('click', () => { $('#q').value = b.dataset.q; go(b.dataset.q); }));

let rw = innerWidth;
addEventListener('resize', () => {
  redrawAll();
  if (innerWidth !== rw) { rw = innerWidth; renderField(current, false); engrave($('#result .engrave')); }
});

render(ROOT.demo, true);
const startQ = new URLSearchParams(location.search).get('q');
if (startQ) { $('#q').value = startQ; go(startQ, { stay: true }); }

/* ---------- engine: the boosted runners, checked live ---------- */
async function watch() {
  const list = $('#watch');
  let runners;
  try { runners = await ROOT.runners(6); } catch (e) { list.innerHTML = '<li class="empty">DexScreener did not answer. Reload to check the runners again.</li>'; return; }
  if (!runners.length) { list.innerHTML = '<li class="empty">No boosted Solana runners right now.</li>'; return; }
  list.innerHTML = runners.map((t, i) => `<li class="pending" id="w${i}">
      <div class="ic">${t.icon ? `<img src="${esc(t.icon)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-letter="?">` : '<b>?</b>'}</div>
      <div><div class="nm">${fmt.short(t.address)}</div><div class="sub">Dating every contract with this name</div></div>
      <div class="verdict">Checking</div></li>`).join('');
  for (let i = 0; i < runners.length; i++) {
    const t = runners[i], li = $('#w' + i);
    try {
      const r = await ROOT.find(t.address);
      const self = [r.root, ...r.copies].find((c) => c.address === t.address) || r.root;
      const isRoot = r.root.address === t.address;
      const copies = r.copies.length;
      li.className = '';
      li.querySelector('.nm').textContent = self.name + ' ($' + self.symbol + ')';
      const ic = li.querySelector('.ic b'); if (ic) ic.textContent = (self.symbol || '?').charAt(0).toUpperCase();
      li.querySelector('.sub').innerHTML = `<code>${fmt.short(t.address)}</code>, ${copies ? copies + (copies === 1 ? ' copy' : ' copies') + ' on Solana' : 'no copies yet'}`;
      const v = li.querySelector('.verdict');
      if (isRoot) { v.className = 'verdict v-root'; v.innerHTML = `Root<small>Buying with fees</small>`; }
      else { v.className = 'verdict v-copy'; v.innerHTML = `Copy, skipped<small>Root is ${fmt.short(r.root.address)}</small>`; }
    } catch (e) {
      li.className = '';
      li.querySelector('.sub').textContent = 'Could not date this one right now';
      li.querySelector('.verdict').textContent = 'Retry later';
    }
    await new Promise((res) => setTimeout(res, 350));
  }
}
const eio = new IntersectionObserver(([en]) => { if (en.isIntersecting) { watch(); eio.disconnect(); } }, { rootMargin: '400px' });
eio.observe($('#engine'));
