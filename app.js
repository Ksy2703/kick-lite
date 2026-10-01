/* Kick Lite v2 – sin datos falsos. Kick bloquea CORS, por eso se usa el proxy api/kick.js.
   Si tu proxy vive en otra URL (Cloudflare Worker, etc.), cámbiala aquí: */
const PROXY = '/api/kick?path=';
const LS = 'kicklite.favs';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => new Intl.NumberFormat('es', {notation:'compact', maximumFractionDigits:1}).format(n || 0);
let tab = 'live', lang = 'es', cache = {}, topList = [], hls = null, cur = null, hideT, upT, wake, tries = 0;

/* ---------- Favoritos ---------- */
const getFavs = () => { try { return JSON.parse(localStorage.getItem(LS)) || []; } catch { return []; } };
const isFav = s => getFavs().includes(s);
const toggleFav = s => { const f = getFavs(); if (!f.includes(s)) saveMemo(s); localStorage.setItem(LS, JSON.stringify(f.includes(s) ? f.filter(x => x !== s) : [...f, s])); };

/* ---------- API ---------- */
const KEYLS = 'kicklite.key';
const kq = () => localStorage.getItem(KEYLS) ? '&k=' + encodeURIComponent(localStorage.getItem(KEYLS)) : '';
async function kick(path) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 12000);
  try {
    const used = localStorage.getItem(KEYLS);
    const r = await fetch(PROXY + encodeURIComponent(path) + kq(), {signal: ac.signal});
    if (r.status === 401) {   // la app es privada: pide el código una sola vez y lo recuerda
      if (localStorage.getItem(KEYLS) === used) { const c = prompt('Esta app es privada. Escribe el código de acceso:'); if (c) localStorage.setItem(KEYLS, c.trim()); }
      if (localStorage.getItem(KEYLS) !== used) { clearTimeout(t); return kick(path); }
      throw new Error('código de acceso requerido');
    }
    if (!r.ok) throw new Error('El proxy respondió ' + r.status);
    return await r.json();
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'tiempo de espera agotado' : e.message); }
  finally { clearTimeout(t); }
}
const img = x => { let u = typeof x === 'string' ? x : (x?.src || x?.url || (x?.srcset || x?.responsive || '').split(' ')[0] || ''); return u.startsWith('//') ? 'https:' + u : u; };
const PICRE = /^(profile_?pic(ture)?|profilepic|avatar)$/i;
function deep(o, re, d = 0) {
  if (!o || typeof o !== 'object' || d > 4) return '';
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (re.test(k)) { const u = img(v); if (/^(https?:)?\/\//.test(u)) return u; }
    if (v && typeof v === 'object') { const r = deep(v, re, d + 1); if (r) return r; }
  }
  return '';
}
function fromChannel(c) {
  const ls = c.livestream;
  return { slug:c.slug, name:c.user?.username || c.slug, avatar:deep(c.user, PICRE) || deep(c, PICRE), live:!!ls,
    title:ls?.session_title || '', game:ls?.categories?.[0]?.name || '', viewers:ls?.viewer_count || 0,
    thumb:img(ls?.thumbnail) || img(c.previous_livestreams?.[0]?.thumbnail) || img(c.offline_banner_image) || img(c.banner_image), hls:c.playback_url || '', since:ls?.created_at || ls?.start_time || '', chat:c.chatroom?.id || 0 };
}
function fromLive(x) {
  return { slug:x.channel?.slug, name:x.channel?.user?.username || x.channel?.slug,
    avatar:deep(x.channel, PICRE) || deep(x, PICRE), live:true,
    title:x.session_title || '', game:x.categories?.[0]?.name || '', viewers:x.viewer_count || 0,
    thumb:img(x.thumbnail), hls:'', since:x.created_at || x.start_time || '' };
}
const getChannel = async slug => fromChannel(await kick('/api/v2/channels/' + encodeURIComponent(slug)));
const LANGS = {es:['es','spanish','español','espanol'], en:['en','english'], pt:['pt','portuguese','português','portugues']};
async function getTop() {
  // Se piden 3 páginas y se filtra por idioma aquí, porque el endpoint no siempre respeta el idioma pedido
  const pages = await Promise.allSettled([1, 2, 3].map(p => kick(`/stream/livestreams/${lang}?sort=desc&page=${p}&language=${lang}`)));
  const ok = pages.filter(p => p.status === 'fulfilled');
  if (!ok.length) throw new Error(pages[0].reason?.message || 'sin respuesta');
  const raw = ok.flatMap(p => Array.isArray(p.value.data) ? p.value.data : (p.value.data?.livestreams || p.value.livestreams || []));
  const seen = new Set(), out = [];
  for (const x of raw) {
    const code = String(x.language || x.channel?.language || '').toLowerCase().trim();
    if (code && !LANGS[lang].includes(code)) continue;     // otro idioma → fuera
    const s = fromLive(x);
    if (s.slug && s.viewers > 0 && !seen.has(s.slug)) { seen.add(s.slug); out.push(s); }
  }
  return out.sort((a, b) => b.viewers - a.viewers);
}

/* ---------- Render ---------- */
const hue = t => Math.abs([...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 360;
const ini = s => `<span class="ini" style="background:hsl(${hue(s.slug || '')} 30% 22%)">${esc((s.name || '?')[0]).toUpperCase()}</span>`;
const pic = u => u ? `<img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '';
const avatar = s => { if (!s.avatar && typeof gd === 'function') gd('sin avatar en los datos: ' + s.slug); return ini(s) + pic(s.avatar); };
const ph = s => { const u = !s.thumb && s.avatar ? esc(s.avatar) : '';
  return `<div class="ph"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>${u ? `<img class="bg" src="${u}" alt="" referrerpolicy="no-referrer"><img class="mid" src="${u}" alt="" referrerpolicy="no-referrer">` : ''}</div>`; };
function card(s) {
  const th = ph(s) + pic(s.thumb);
  return `<li class="card" data-slug="${esc(s.slug)}">
    <div class="th ${s.live ? '' : 'off'}">${th}${s.live ? `<span class="badge">EN VIVO</span><span class="vw">${fmt(s.viewers)}</span>` : '<span class="badge off">OFFLINE</span>'}</div>
    <div class="meta"><div class="av">${avatar(s)}</div>
      <div class="info"><div class="t">${esc(s.live ? s.title : 'Sin transmisión')}</div><div class="m">${esc(s.name)}${s.game ? ' · ' + esc(s.game) : ''}</div></div>
      <button class="fav ${isFav(s.slug) ? 'on' : ''}" data-fav="${esc(s.slug)}" aria-label="Favorito">${isFav(s.slug) ? '♥' : '♡'}</button></div></li>`;
}
const MEMO = 'kicklite.info';
function memoize(items) {
  let m = {}; try { m = JSON.parse(localStorage.getItem(MEMO)) || {}; } catch {}
  let dirty = false;
  items.forEach(s => {
    const fav = isFav(s.slug); let o = m[s.slug] || {};
    if (s.avatar) { if (fav && o.avatar !== s.avatar) { o = m[s.slug] = {...o, avatar:s.avatar}; dirty = true; } } else s.avatar = o.avatar || '';
    if (s.live) { if (s.thumb && fav && o.thumb !== s.thumb) { m[s.slug] = {...o, thumb:s.thumb}; dirty = true; } }
    else if (o.thumb) s.thumb = o.thumb;                 // offline: última vista previa guardada
    if (!s.thumb) s.thumb = o.thumb || '';
  });
  if (dirty) try { localStorage.setItem(MEMO, JSON.stringify(m)); } catch {}
}
function saveMemo(slug) {   // al marcar ♡ se guarda lo que ya se ve en pantalla
  const c = cache[slug]; if (!c) return; let m = {}; try { m = JSON.parse(localStorage.getItem(MEMO)) || {}; } catch {}
  m[slug] = {...m[slug], ...(c.avatar ? {avatar:c.avatar} : {}), ...(c.live && c.thumb ? {thumb:c.thumb} : {})};
  try { localStorage.setItem(MEMO, JSON.stringify(m)); } catch {}
}
async function hydrate(items) {   // completa avatares que faltan pidiendo el canal (máx. 6, uno a uno)
  for (const s of items.filter(x => !x.avatar && !x.hyd).slice(0, 6)) {
    s.hyd = true;
    try {
      const c = await getChannel(s.slug); if (!c.avatar) continue;
      s.avatar = c.avatar; cache[s.slug] = {...cache[s.slug], avatar:c.avatar};
      document.querySelectorAll('.card').forEach(el => { if (el.dataset.slug === s.slug) el.querySelector('.av').innerHTML = avatar(s); });
    } catch {}
  }
}
function show(items, msg, retry) {
  memoize(items);
  if (tab !== 'favs') setTimeout(() => hydrate(items), 300);
  items.forEach(s => cache[s.slug] = {...cache[s.slug], ...s});
  $('#list').innerHTML = items.map(card).join('');
  $('#empty').hidden = items.length > 0;
  $('#empty p').textContent = msg || '';
  $('#reload').hidden = !retry;
}
const banner = m => { $('#banner').hidden = !m; $('#banner').textContent = m || ''; };

async function load() {
  $('#title').textContent = {live:'Más vistos', favs:'Favoritos', multi:'Multistream', search:'Buscar'}[tab];
  $('#chips').hidden = tab !== 'live'; document.body.classList.toggle('sr', tab !== 'live');
  $('#searchForm').hidden = tab !== 'search';
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('#multi').hidden = tab !== 'multi';
  if (tab !== 'multi') multiStop();
  else { $('#list').innerHTML = ''; $('#empty').hidden = true; banner(''); multiStart(); return; }
  $('#list').innerHTML = ''; banner('');
  $('#empty').hidden = false; $('#empty p').textContent = 'Cargando…'; $('#reload').hidden = true;
  try {
    if (tab === 'live') {
      topList = await getTop();
      show(topList, 'No hay transmisiones en este idioma ahora mismo.', true);
    } else if (tab === 'favs') {
      const favs = getFavs();
      if (!favs.length) return show([], 'Aún no tienes favoritos. Toca ♡ en cualquier canal.');
      const res = await Promise.allSettled(favs.map(getChannel));
      const items = res.map((r, i) => r.status === 'fulfilled' ? r.value : {slug:favs[i], name:favs[i], avatar:'', live:false, viewers:0, title:'', game:'', thumb:'', hls:''});
      show(items.sort((a, b) => b.live - a.live || b.viewers - a.viewers));
    } else show([], 'Escribe el nombre exacto de un canal de Kick.');
  } catch (e) {
    show([], 'No se pudo conectar con Kick (' + e.message + '). Revisa que api/kick.js esté desplegado en Vercel.', true);
  }
}

/* ---------- Reproductor ---------- */
const v = $('#video');
v.disableRemotePlayback = true;                    // necesario para hls.js en iOS 17.1+
let watch;
const ovShow = () => { $('#ov').classList.remove('hide'); clearTimeout(hideT); if (!v.paused) hideT = setTimeout(() => $('#ov').classList.add('hide'), 3000); };
function paintP() {
  $('#pp').textContent = v.paused ? '▶' : '❚❚';
  $('#mute').textContent = v.muted || v.volume === 0 ? '🔇' : '🔊';
  seekInfo();
}
let dragging = false;
const mmss = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const edge = () => v.seekable.length ? v.seekable.end(v.seekable.length - 1) : 0;
let firstLive = true;
function goLive() { const e = edge(); if (e > 0) v.currentTime = Math.max(v.seekable.start(0), e - 1); v.play().catch(() => {}); }
function seekInfo() {
  if (!v.seekable.length) return;
  const s = v.seekable.start(0), e = edge(), sk = $('#seek'), behind = Math.max(0, e - v.currentTime);
  if (!dragging) { sk.min = s; sk.max = e; sk.value = behind <= 8 ? e : v.currentTime; }
  $('#tl').textContent = behind > 8 ? '-' + mmss(behind) : 'EN VIVO';
  $('#golive').classList.toggle('behind', behind > 8);
}
function paintInfo() {
  const s = cur, on = isFav(s.slug);
  $('#pav').innerHTML = avatar(s); $('#ptitle').textContent = s.title;
  $('#pmeta').textContent = `${s.name}${s.game ? ' · ' + s.game : ''}`;
  $('#pview').textContent = s.viewers ? `${fmt(s.viewers)} viendo` : '';
  $('#pfav').classList.toggle('on', on); $('#pfav').textContent = on ? '♥' : '♡';
  clearInterval(upT);
  if (s.since) { const t = () => { const m = Math.max(0, Math.floor((Date.now() - new Date(s.since.replace(' ', 'T') + (/Z|\+/.test(s.since) ? '' : 'Z'))) / 60000));
      if (!isNaN(m)) $('#pmeta').textContent = `${s.name}${s.game ? ' · ' + s.game : ''} · ${Math.floor(m / 60)}h ${m % 60}m en directo`; }; t(); upT = setInterval(t, 60000); }
}
/* Reproducción propia, sin anuncios: 1) directo  2) mismo video pasando por tu proxy /api/hls.
   Si ambos fallan solo se muestra un botón ↻ (sin textos técnicos). Añade ?debug a la URL para ver el detalle. */
const HLSPROXY = '/api/hls?u=';
const DEBUG = /[?&]debug/.test(location.search);
let mode = 'direct';
const gd = t => { if (!DEBUG) return; let d = $('#gdbg'); if (!d) { d = document.createElement('pre'); d.id = 'gdbg';
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:70px;max-height:30vh;overflow:hidden;margin:0;padding:6px;font-size:10px;background:#000c;color:#9fb0a5;z-index:99;pointer-events:none;white-space:pre-wrap;word-break:break-all'; document.body.appendChild(d); }
  d.textContent = t + '\n' + d.textContent.slice(0, 700); };
const dbg = (...a) => { console.log('[kick]', ...a); if (DEBUG) { const d = $('#dbg'); d.hidden = false; d.textContent = a.join(' ') + '\n' + d.textContent.slice(0, 300); } };
function giveUp() { clearTimeout(watch); if (hls) { hls.destroy(); hls = null; } $('#retry').hidden = false; }
function next(reason) {
  dbg('fallo en', mode, '→', reason); clearTimeout(watch);
  if (mode === 'direct') { mode = 'proxy'; tries = 0; startStream(); } else giveUp();
}
async function play(slug) {
  stop(true);
  cur = {...cache[slug]}; mode = 'direct'; tries = 0;
  $('#player').hidden = false; $('#player').scrollTop = 0; document.body.style.overflow = 'hidden';
  $('#retry').hidden = true; v.poster = cur.thumb || ''; paintInfo();
  const more = topList.filter(s => s.slug !== slug).slice(0, 8);
  $('#more').innerHTML = more.map(card).join(''); more.forEach(s => cache[s.slug] ||= s);
  try { const c = await getChannel(slug); if (cur?.slug !== slug) return; cur = {...cur, ...c}; paintInfo(); chatStart(cur.chat, slug); }
  catch (e) { dbg('canal', e.message); return giveUp(); }
  if (!cur.live || !cur.hls) { dbg('sin url de video', cur.live); return giveUp(); }
  dbg('url', cur.hls);
  startStream();
  try { wake = await navigator.wakeLock?.request('screen'); } catch {}
}
function startStream() {
  firstLive = true; clearTimeout(watch); $('#retry').hidden = true;
  if (hls) { hls.destroy(); hls = null; }
  watch = setTimeout(() => next('sin respuesta en 12 s'), 12000);
  if (window.Hls && Hls.isSupported()) {          // Android / Chrome / Firefox / iOS 17.1+
    const cfg = {lowLatencyMode:false, maxBufferLength:20, backBufferLength:300, liveSyncDurationCount: mode === 'direct' ? 2 : 3, maxLiveSyncPlaybackRate:1.1, manifestLoadingMaxRetry:1, fragLoadingMaxRetry:3};
    if (mode === 'proxy') cfg.xhrSetup = (xhr, url) => xhr.open('GET', HLSPROXY + encodeURIComponent(url) + kq(), true);
    hls = new Hls(cfg);
    hls.on(Hls.Events.MANIFEST_PARSED, (_, d) => {
      $('#qual').innerHTML = '<option value="-1">Auto</option>' + d.levels.map((l, i) => `<option value="${i}">${l.height}p</option>`).reverse().join('');
      play2();
    });
    hls.on(Hls.Events.ERROR, (_, d) => {
      dbg(d.type, d.details, d.response?.code || '');
      if (!d.fatal) return;
      if (d.type === Hls.ErrorTypes.MEDIA_ERROR && tries++ < 2) return hls.recoverMediaError();
      next(d.details);
    });
    hls.loadSource(cur.hls); hls.attachMedia(v);
  } else {                                         // iOS antiguo: HLS nativo
    v.onerror = () => next('nativo');
    v.src = mode === 'proxy' ? '/api/hls?r=1' + kq() + '&u=' + encodeURIComponent(cur.hls) : cur.hls; play2();
  }
}
function play2() { v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); }
function stop(keepUI) {
  clearTimeout(watch); clearInterval(upT);
  chatStop(); v.onerror = null; v.pause(); v.removeAttribute('src'); v.load();
  if (hls) { hls.destroy(); hls = null; }
  $('#retry').hidden = true; $('#dbg').hidden = true;
  wake?.release?.().catch?.(() => {}); wake = null;
  if (!keepUI) { $('#player').hidden = true; document.body.style.overflow = ''; cur = null; if (document.fullscreenElement) document.exitFullscreen(); }
}

/* ---------- Chat (WebSocket público de Kick, solo lectura). Fábrica: permite varias instancias ---------- */
const CHAT_WS = 'wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0&flash=false';
function Chat(S) {   // S = selectores {msgs, box, jump, frame}
  let ws = null, gen = 0;
  const close = () => { if (ws) { ws.onclose = ws.onmessage = null; try { ws.close(); } catch {} ws = null; } };
  const clear = () => { gen++; close(); $(S.msgs).innerHTML = ''; $(S.frame).innerHTML = ''; $(S.jump).hidden = true; };
  const frame = slug => { close(); $(S.frame).innerHTML = `<iframe src="https://kick.com/popout/${encodeURIComponent(slug)}/chat" loading="lazy"></iframe>`; };
  function add(d) {
    if (!d?.content) return;
    const box = $(S.box), near = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    const col = /^#[0-9a-f]{3,8}$/i.test(d.sender?.identity?.color || '') ? d.sender.identity.color : '#9fb0a5';
    const txt = esc(d.content).replace(/\[emote:(\d+):([^\]]*)\]/g, (_, id, n) => `<img src="https://files.kick.com/emotes/${id}/fullsize" alt="${n}" loading="lazy">`);
    const li = document.createElement('li'); li.className = 'msg';
    li.innerHTML = `<b style="color:${col}">${esc(d.sender?.username || '')}</b>${txt}`;
    const ul = $(S.msgs); ul.appendChild(li);
    while (ul.children.length > 150) ul.firstChild.remove();
    if (near) box.scrollTop = box.scrollHeight; else $(S.jump).hidden = false;
  }
  function start(id, slug) {
    clear(); const g = gen;
    if (!id) return frame(slug);
    let ok = false, fails = 0;
    const connect = () => {
      const t = setTimeout(() => { if (!ok && g === gen) { dbg('chat sin respuesta'); frame(slug); } }, 8000);
      ws = new WebSocket(CHAT_WS);
      ws.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.event === 'pusher:connection_established') ws.send(JSON.stringify({event:'pusher:subscribe', data:{auth:'', channel:`chatrooms.${id}.v2`}}));
        else if (m.event === 'pusher_internal:subscription_succeeded') { ok = true; fails = 0; clearTimeout(t); dbg('chat conectado'); }
        else if (m.event === 'pusher:ping') ws.send(JSON.stringify({event:'pusher:pong', data:{}}));
        else if (m.event === 'App\\Events\\ChatMessageEvent') { try { add(JSON.parse(m.data)); } catch {} }
      };
      ws.onclose = () => {
        clearTimeout(t); if (g !== gen) return;
        if (!ok || ++fails > 3) { dbg('chat cerrado'); return frame(slug); }
        setTimeout(() => g === gen && connect(), 2000);   // reconexión automática
      };
    };
    connect();
  }
  return {start, stop: clear};
}
const chatMain = Chat({msgs:'#msgs', box:'#chat', jump:'#jump', frame:'#chatbox'});
const chatStart = (id, slug) => chatMain.start(id, slug), chatStop = () => chatMain.stop();

document.addEventListener('error', e => {
  const i = e.target; if (i.tagName !== 'IMG') return;
  const o = i.dataset.o || i.src;
  gd('imagen falló (' + (i.dataset.fb ? 'proxy' : 'directo') + '): ' + o);
  if (!i.dataset.fb && /^https:\/\/([\w-]+\.)*kick\.com\//.test(o)) { i.dataset.fb = '1'; i.dataset.o = o; i.src = '/api/img?u=' + encodeURIComponent(o) + kq(); }
  else i.remove();
}, true);

/* ---------- Multistream: hasta 4 streams, un chat visible ---------- */
const MLS = 'kicklite.multi', MAX = 4, SLUG = /^[\w-]{2,40}$/;
let mslots = ['', '', '', ''], msel = '', cells = {};
let lay = localStorage.getItem('kicklite.mlay') || 'focus';   // 'focus' = uno grande + 3 pequeños · 'grid' = 2×2
const mchat = Chat({msgs:'#mmsgs', box:'#mchat', jump:'#mjump', frame:'#mbox'});
const saveSlots = () => { try { localStorage.setItem(MLS, JSON.stringify(mslots)); } catch {} };
const cp = v => v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
const cellEl = slug => $('#mgrid').querySelector(`.cell[data-slug="${slug}"]`);

function multiStart() {
  let s = []; try { s = JSON.parse(localStorage.getItem(MLS)) || []; } catch {}
  const seen = new Set();
  mslots = [...s, '', '', '', ''].slice(0, MAX).map(x => (SLUG.test(x) && !seen.has(x) && seen.add(x)) ? x : '');
  if (!msel || !mslots.includes(msel)) msel = mslots.find(Boolean) || '';
  $('#mgrid').innerHTML = '<div class="cell"></div>'.repeat(MAX);
  for (let i = 0; i < MAX; i++) fillSlot(i);
  renderMTabs();
}
function multiStop() { Object.keys(cells).forEach(cellStop); mchat.stop(); $('#mgrid').innerHTML = ''; }
function fillSlot(i) {
  const d = $('#mgrid').children[i], slug = mslots[i];
  d.className = 'cell' + (slug && slug === msel ? ' sel' : ''); d.onclick = null; d.removeAttribute('data-slug');
  if (!slug) { d.innerHTML = '<button class="add" aria-label="Añadir stream">+</button>'; d.onclick = openSheet; return; }
  d.dataset.slug = slug;
  d.innerHTML = `<video playsinline muted autoplay></video><div class="cs"></div><div class="cn">${esc(cache[slug]?.name || slug)}</div><button class="cx" data-x="${slug}" aria-label="Quitar">✕</button><button class="cf" data-f="${slug}" aria-label="Ver grande">⛶</button><button class="cr" data-r="${slug}" hidden aria-label="Reintentar">↻</button>`;
  cellStart(slug);
}
async function cellStart(slug) {
  const el = cellEl(slug); if (!el) return;
  const c = cells[slug] = {el, v:el.querySelector('video'), hls:null, mode:'direct', tries:0, watch:0, info:null};
  c.v.muted = slug !== msel; c.v.addEventListener('playing', () => clearTimeout(c.watch));
  el.querySelector('.cr').hidden = true; el.querySelector('.cs').textContent = '';
  try { c.info = await getChannel(slug); } catch { return cellFail(c, 'Sin conexión'); }
  if (cells[slug] !== c) return;
  cache[slug] = {...cache[slug], ...c.info};
  el.querySelector('.cn').textContent = c.info.name; renderMTabs();
  if (slug === msel) mchatSwitch();
  if (!c.info.live || !c.info.hls) return cellFail(c, 'Offline');
  cellPlay(c, slug);
}
function cellPlay(c, slug) {
  clearTimeout(c.watch); if (c.hls) { c.hls.destroy(); c.hls = null; }
  c.el.querySelector('.cr').hidden = true;
  c.watch = setTimeout(() => cellNext(c, slug), 12000);
  if (window.Hls && Hls.isSupported()) {
    const cfg = {capLevelToPlayerSize:true, maxBufferLength:12, backBufferLength:20, liveSyncDurationCount: c.mode === 'direct' ? 2 : 3, manifestLoadingMaxRetry:1};
    if (c.mode === 'proxy') cfg.xhrSetup = (xhr, url) => xhr.open('GET', HLSPROXY + encodeURIComponent(url) + kq(), true);
    c.hls = new Hls(cfg);
    c.hls.on(Hls.Events.MANIFEST_PARSED, () => cp(c.v));
    c.hls.on(Hls.Events.ERROR, (_, d) => {
      if (!d.fatal) return;
      if (d.type === Hls.ErrorTypes.MEDIA_ERROR && c.tries++ < 2) return c.hls.recoverMediaError();
      cellNext(c, slug);
    });
    c.hls.loadSource(c.info.hls); c.hls.attachMedia(c.v);
  } else {
    c.v.onerror = () => cellNext(c, slug);
    c.v.src = c.mode === 'proxy' ? '/api/hls?r=1' + kq() + '&u=' + encodeURIComponent(c.info.hls) : c.info.hls; cp(c.v);
  }
}
function cellNext(c, slug) {
  if (cells[slug] !== c) return; clearTimeout(c.watch);
  if (c.mode === 'direct') { c.mode = 'proxy'; c.tries = 0; cellPlay(c, slug); } else cellFail(c, '');
}
function cellFail(c, msg) {
  clearTimeout(c.watch); if (c.hls) { c.hls.destroy(); c.hls = null; }
  c.el.querySelector('.cs').textContent = msg || ''; c.el.querySelector('.cr').hidden = false;
}
function cellStop(slug) {
  const c = cells[slug]; if (!c) return; clearTimeout(c.watch); c.v.onerror = null;
  if (c.hls) c.hls.destroy(); c.v.pause(); c.v.removeAttribute('src'); c.v.load(); delete cells[slug];
}
function applyAudio() {
  document.querySelectorAll('#mgrid .cell').forEach(el => {
    el.classList.toggle('sel', !!msel && el.dataset.slug === msel);
    const v = el.querySelector('video'); if (v) { v.muted = el.dataset.slug !== msel; if (!v.muted) cp(v); }
  });
}
function selectCell(slug) {
  const changed = slug !== msel; msel = slug; applyAudio();
  if (changed) { renderMTabs(); mchatSwitch(); }
}
function mchatSwitch() {
  mchat.stop(); const c = cells[msel];
  if (c?.info) mchat.start(c.info.chat, msel);
}
function renderMTabs() {
  $('#mgrid').classList.toggle('focus', lay === 'focus' && !!msel);
  const l = mslots.filter(Boolean);
  $('#mtabs').innerHTML = l.length ? l.map(s => `<button data-c="${s}" class="${s === msel ? 'on' : ''}">${esc(cache[s]?.name || s)}</button>`).join('') : '<span class="mh">Toca + para añadir hasta 4 streams</span>';
  $('#mtabs').insertAdjacentHTML('beforeend', `<button class="lay" data-lay="1" aria-label="Cambiar diseño">${lay === 'focus' ? '▦' : '▣'}</button>`);
}
function removeSlot(slug) {
  const i = mslots.indexOf(slug); if (i < 0) return;
  cellStop(slug); mslots[i] = ''; saveSlots();
  const was = msel === slug; if (was) msel = mslots.find(Boolean) || '';
  fillSlot(i); applyAudio(); renderMTabs(); if (was) mchatSwitch();
}
function addSlot(slug) {
  slug = slug.trim().toLowerCase().replace(/\s+/g, '-');
  if (!SLUG.test(slug) || mslots.includes(slug)) return;
  const i = mslots.findIndex(x => !x); if (i < 0) return;
  mslots[i] = slug; saveSlots(); closeSheet();
  if (!msel) msel = slug;
  fillSlot(i); renderMTabs();
}
function openSheet() {
  const favs = getFavs(), top = topList.slice(0, 12).map(s => s.slug), seen = new Set(mslots);
  const row = sl => { seen.add(sl); const s = cache[sl] || {slug:sl, name:sl};
    return `<button class="srow" data-add="${esc(sl)}"><div class="av">${avatar(s)}</div><span>${esc(s.name || sl)}</span><small>${s.live ? fmt(s.viewers) + ' viendo' : ''}</small></button>`; };
  const f = favs.filter(x => !seen.has(x) && SLUG.test(x)).map(row).join('');
  const t = top.filter(x => !seen.has(x) && SLUG.test(x)).map(row).join('');
  $('#slist').innerHTML = (f ? '<div class="sgt">Favoritos</div>' + f : '') + (t ? '<div class="sgt">Más vistos</div>' + t : '');
  $('#sheet').hidden = false;
}
const closeSheet = () => { $('#sheet').hidden = true; };
$('#sclose').onclick = closeSheet;
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') return closeSheet(); const b = e.target.closest('[data-add]'); if (b) addSlot(b.dataset.add); });
$('#sform').addEventListener('submit', e => { e.preventDefault(); addSlot($('#sq').value); $('#sq').value = ''; });
$('#mtabs').addEventListener('click', e => {
  if (e.target.closest('[data-lay]')) { lay = lay === 'focus' ? 'grid' : 'focus'; try { localStorage.setItem('kicklite.mlay', lay); } catch {} return renderMTabs(); }
  const b = e.target.closest('[data-c]'); if (b) selectCell(b.dataset.c);
});
$('#mgrid').addEventListener('click', e => {
  const x = e.target.closest('[data-x]'), f = e.target.closest('[data-f]'), r = e.target.closest('[data-r]'), cell = e.target.closest('.cell');
  if (x) return removeSlot(x.dataset.x);
  if (f) { const s = f.dataset.f; cache[s] ||= {slug:s, name:s, avatar:'', live:true, title:'', game:'', viewers:0, thumb:'', hls:''}; multiStop(); return play(s); }
  if (r) { cellStop(r.dataset.r); return cellStart(r.dataset.r); }
  if (cell?.dataset.slug) selectCell(cell.dataset.slug);
});
$('#mjump').onclick = () => { $('#mchat').scrollTop = $('#mchat').scrollHeight; $('#mjump').hidden = true; };
$('#mchat').addEventListener('scroll', () => { const b = $('#mchat'); if (b.scrollHeight - b.scrollTop - b.clientHeight < 60) $('#mjump').hidden = true; });

/* ---------- Eventos ---------- */
['play', 'pause', 'volumechange', 'timeupdate'].forEach(e => v.addEventListener(e, paintP));
v.addEventListener('playing', () => { clearTimeout(watch); ovShow(); if (firstLive && edge() > 0) { firstLive = false; goLive(); } });
$('#stage').addEventListener('click', e => { if (e.target.closest('button,select,input')) return; $('#ov').classList.contains('hide') ? ovShow() : $('#ov').classList.add('hide'); });
$('#pp').onclick = () => { v.paused ? v.play() : v.pause(); ovShow(); };
$('#mute').onclick = () => { v.muted = !v.muted; ovShow(); };
$('#vol').oninput = e => { v.volume = +e.target.value; v.muted = v.volume === 0; };
$('#golive').onclick = () => { goLive(); ovShow(); };
$('#qual').onchange = e => { if (hls) hls.currentLevel = +e.target.value; };
$('#fs').onclick = () => { const st = $('#stage'); if (document.fullscreenElement) document.exitFullscreen(); else if (st.requestFullscreen) st.requestFullscreen(); else v.webkitEnterFullscreen?.(); };
$('#pip').onclick = () => { if (document.pictureInPictureEnabled) document.pictureInPictureElement ? document.exitPictureInPicture() : v.requestPictureInPicture().catch(() => {}); else v.webkitSetPresentationMode?.('picture-in-picture'); };
$('#close').onclick = () => { stop(); if (tab === 'multi') multiStart(); };
$('#pfav').onclick = () => { toggleFav(cur.slug); paintInfo(); };
$('#reload').onclick = load;
$('#retry').onclick = () => cur && play(cur.slug);
$('#seek').addEventListener('input', e => { dragging = true; ovShow(); $('#tl').textContent = '-' + mmss(+e.target.max - +e.target.value); });
$('#seek').addEventListener('change', e => { v.currentTime = +e.target.value; dragging = false; ovShow(); });
$('#rw').onclick = () => { v.currentTime = Math.max(v.seekable.length ? v.seekable.start(0) : 0, v.currentTime - 10); ovShow(); };
$('#ff').onclick = () => { v.currentTime = Math.min(edge() - 1, v.currentTime + 10); ovShow(); };
document.querySelector('.seg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  document.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b));
  $('#chat').hidden = b.dataset.pane !== 'chat'; $('#morepane').hidden = b.dataset.pane === 'chat';
});
$('#jump').onclick = () => { $('#chat').scrollTop = $('#chat').scrollHeight; $('#jump').hidden = true; };
$('#chat').addEventListener('scroll', () => { if ($('#chat').scrollHeight - $('#chat').scrollTop - $('#chat').clientHeight < 60) $('#jump').hidden = true; });

const listClick = e => {
  const fb = e.target.closest('[data-fav]');
  if (fb) { toggleFav(fb.dataset.fav); if (tab === 'favs' && !$('#player').hidden === false) load(); else { fb.classList.toggle('on'); fb.textContent = isFav(fb.dataset.fav) ? '♥' : '♡'; } return; }
  const li = e.target.closest('.card'); if (li) play(li.dataset.slug);
};
$('#list').addEventListener('click', listClick); $('#more').addEventListener('click', listClick);
$('.tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { tab = b.dataset.tab; load(); } });
$('#chips').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; lang = b.dataset.lang;
  document.querySelectorAll('#chips button').forEach(x => x.classList.toggle('on', x === b)); load();
});
$('#searchForm').addEventListener('submit', async e => {
  e.preventDefault(); const slug = $('#q').value.trim().toLowerCase().replace(/\s+/g, '-'); if (!slug) return;
  $('#list').innerHTML = ''; $('#empty').hidden = false; $('#empty p').textContent = 'Buscando…'; $('#reload').hidden = true;
  try { show([await getChannel(slug)]); } catch { show([], `No se encontró el canal "${slug}".`); }
});

load();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js');
