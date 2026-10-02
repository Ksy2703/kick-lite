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
    thumb:img(ls?.thumbnail) || img(c.previous_livestreams?.[0]?.thumbnail) || img(c.offline_banner_image) || img(c.banner_image), hls:c.playback_url || '', since:ls?.created_at || ls?.start_time || '', chat:c.chatroom?.id || 0, uid:c.user_id || c.user?.id || 0, subs:c.subscriber_badges || [] };
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
  try { const c = await getChannel(slug); if (cur?.slug !== slug) return; cur = {...cur, ...c}; paintInfo(); chatStart(cur.chat, slug, cur.subs); paintAuth(); }
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
    cfg.loader = teeLoader(); hls = new Hls(cfg); ring = []; ringOK = true;
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
    ringOK = false; v.onerror = () => next('nativo');
    v.src = mode === 'proxy' ? '/api/hls?r=1' + kq() + '&u=' + encodeURIComponent(cur.hls) : cur.hls; play2();
  }
}
function play2() { v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); }
function stop(keepUI) {
  clearTimeout(watch); clearInterval(upT); ring = [];
  chatStop(); v.onerror = null; v.pause(); v.removeAttribute('src'); v.load();
  if (hls) { hls.destroy(); hls = null; }
  $('#retry').hidden = true; $('#dbg').hidden = true;
  wake?.release?.().catch?.(() => {}); wake = null;
  if (!keepUI) { $('#player').hidden = true; document.body.style.overflow = ''; cur = null; if (document.fullscreenElement) document.exitFullscreen(); }
}

/* ---------- Chat (WebSocket público de Kick). Fábrica: varias instancias ---------- */
const CHAT_WS = 'wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0&flash=false';
const BD = {broadcaster:['🎥','Streamer'], moderator:['🛡️','Mod'], vip:['💎','VIP'], og:['OG','OG'], founder:['F','Fundador'], verified:['✔','Verificado'], sub_gifter:['🎁','Regalador'], subscriber:['★','Sub']};
function Chat(S) {   // S = selectores {msgs, box, jump, frame}
  let ws = null, gen = 0, subs = [];
  const close = () => { if (ws) { ws.onclose = ws.onmessage = null; try { ws.close(); } catch {} ws = null; } };
  const clear = () => { gen++; close(); $(S.msgs).innerHTML = ''; $(S.frame).innerHTML = ''; $(S.jump).hidden = true; $(S.box).querySelector('.pin')?.remove(); };
  const frame = slug => { close(); $(S.frame).innerHTML = `<iframe src="https://kick.com/popout/${encodeURIComponent(slug)}/chat" loading="lazy"></iframe>`; };
  const emotes = t => esc(t).replace(/\[emote:(\d+):([^\]]*)\]/g, (_, id, n) => `<img src="https://files.kick.com/emotes/${id}/fullsize" alt="${n}" loading="lazy">`);
  const badge = b => {
    if (b.type === 'subscriber') {
      const m = b.count || 0, best = subs.filter(x => x.months <= m).sort((p, q) => q.months - p.months)[0], u = img(best?.badge_image);
      if (u) return `<img class="bd" src="${esc(u)}" alt="Sub" title="Sub ${m} m">`;
    }
    const x = BD[b.type]; return x ? `<span class="bd t-${esc(b.type)}" title="${esc(x[1])}">${x[0]}</span>` : '';
  };
  function push(li) {
    const box = $(S.box), near = box.scrollHeight - box.scrollTop - box.clientHeight < 80, ul = $(S.msgs);
    ul.appendChild(li); while (ul.children.length > 150) ul.firstChild.remove();
    if (near) box.scrollTop = box.scrollHeight; else $(S.jump).hidden = false;
  }
  function build(d) {
    if (!d?.content) return null;
    const li = document.createElement('li'); li.className = 'msg'; if (d.id) li.dataset.id = d.id;
    const col = /^#[0-9a-f]{3,8}$/i.test(d.sender?.identity?.color || '') ? d.sender.identity.color : '#9fb0a5';
    const bs = (d.sender?.identity?.badges || []).map(badge).join('');
    const o = d.metadata?.original_sender;
    const rep = o ? `<div class="rp">↪ ${esc(o.username || '')}: ${esc((d.metadata.original_message?.content || '').slice(0, 80))}</div>` : '';
    li.innerHTML = `${rep}${bs}<b style="color:${col}">${esc(d.sender?.username || '')}</b>${emotes(d.content)}`;
    return li;
  }
  function sys(t, cls) { const li = document.createElement('li'); li.className = 'msg sys ' + cls; li.textContent = t; push(li); }
  function del(d) {
    const id = String(d?.message?.id || d?.id || ''); if (!id) return;
    $(S.msgs).querySelectorAll('li').forEach(li => { if (li.dataset.id === id) li.classList.add('del'); });
  }
  function pin(d) {
    const m = d?.message || d; if (!m?.content) return;
    let p = $(S.box).querySelector('.pin'); if (!p) { p = document.createElement('div'); p.className = 'pin'; $(S.box).prepend(p); }
    p.innerHTML = `<span><b>📌 ${esc(m.sender?.username || '')}</b> ${emotes(m.content)}</span><button aria-label="Ocultar">✕</button>`;
    p.querySelector('button').onclick = () => p.remove();
  }
  function event(n, d) {
    if (!d) return;
    if (n === 'ChatMessageEvent') { const li = build(d); if (li) push(li); }
    else if (n === 'MessageDeletedEvent') del(d);
    else if (n === 'SubscriptionEvent') sys(`★ ${d.username || ''} se suscribió${d.months > 1 ? ' · ' + d.months + ' meses' : ''}`, 'sub');
    else if (n === 'GiftedSubscriptionsEvent') { const k = d.gifted_usernames?.length || 1; sys(`🎁 ${d.gifter_username || ''} regaló ${k} sub${k > 1 ? 's' : ''}`, 'gift'); }
    else if (n === 'RewardRedeemedEvent') sys(`🎯 ${d.username || d.user_name || ''} canjeó ${d.reward_title || 'una recompensa'}`, 'rw');
    else if (n === 'PinnedMessageCreatedEvent') pin(d);
    else if (n === 'PinnedMessageDeletedEvent') $(S.box).querySelector('.pin')?.remove();
    else gd('evento sin manejar: ' + n);
  }
  function start(id, slug, badges) {
    clear(); subs = Array.isArray(badges) ? badges : []; const g = gen;
    if (!id) return frame(slug);
    let ok = false, fails = 0;
    const connect = () => {
      const t = setTimeout(() => { if (!ok && g === gen) { dbg('chat sin respuesta'); frame(slug); } }, 8000);
      ws = new WebSocket(CHAT_WS);
      ws.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        const ev = String(m.event || '');
        if (ev === 'pusher:connection_established') ws.send(JSON.stringify({event:'pusher:subscribe', data:{auth:'', channel:`chatrooms.${id}.v2`}}));
        else if (ev === 'pusher_internal:subscription_succeeded') { ok = true; fails = 0; clearTimeout(t); dbg('chat conectado'); }
        else if (ev === 'pusher:ping') ws.send(JSON.stringify({event:'pusher:pong', data:{}}));
        else if (ev.startsWith('App\\Events\\')) {
          let d = m.data; if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
          try { event(ev.slice(11), d); } catch {}
        }
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
const chatStart = (id, slug, subs) => chatMain.start(id, slug, subs), chatStop = () => chatMain.stop();

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
  if (c?.info) mchat.start(c.info.chat, msel, c.info.subs);
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

/* ---------- Clips: buffer en memoria de los últimos segundos del directo ---------- */
const CLIP_KEEP = 150;   // segundos guardados (≈ 50–90 MB según calidad)
let ring = [], ringOK = true, drafts = [], ed = null, toastT;
let clipDur = +localStorage.getItem('kicklite.clipdur') || 30;
const toast = t => { const e = $('#toast'); e.textContent = t; e.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => e.hidden = true, 2600); };
function ringAdd(f, data) {
  if (!data || !data.byteLength) return;
  if (new Uint8Array(data, 0, 1)[0] !== 0x47) { ringOK = false; dbg('clip: segmentos no son MPEG-TS'); return; }   // solo MPEG-TS
  if (ring.some(x => x.sn === f.sn)) return;
  if (!ring.length) dbg('clip: buffer activo');
  ring.push({sn:f.sn, start:f.start, dur:f.duration, level:f.level, data:data.slice(0)});
  ring.sort((p, q) => p.sn - q.sn);
  let tot = ring.reduce((s, x) => s + x.dur, 0);
  while (tot > CLIP_KEEP && ring.length > 1) tot -= ring.shift().dur;
}
/* Cargador de HLS.js que "copia" cada segmento de video al buffer de clips mientras se reproduce normal */
let TeeLoader = null;
function teeLoader() {
  return TeeLoader ||= class extends Hls.DefaultConfig.loader {
    load(context, config, callbacks) {
      const f = context.frag;
      if (f && f.type === 'main' && typeof f.sn === 'number') {
        const ok = callbacks.onSuccess;
        callbacks = {...callbacks, onSuccess: (r, st, c, n) => { try { ringAdd(f, r.data); } catch {} return ok(r, st, c, n); }};
      }
      return super.load(context, config, callbacks);
    }
  };
}
function makeClip() {
  if (!cur) return;
  if (!ringOK) return toast('Este navegador no permite clips en este stream');
  if (!ring.length) return toast('Espera unos segundos y vuelve a tocar ✂');
  const endT = v.currentTime;
  let sel = ring.filter(x => x.start < endT + 0.01 && x.start + x.dur > endT - clipDur);
  let i = sel.length - 1; while (i > 0 && sel[i - 1].sn === sel[i].sn - 1 && sel[i - 1].level === sel[i].level) i--;
  sel = sel.slice(i);
  if (!sel.length) return toast('Ese momento ya no está en el buffer');
  const dur = sel.reduce((s, x) => s + x.dur, 0);
  drafts.unshift({id:Date.now(), slug:cur.slug, name:cur.name || cur.slug, at:new Date(), frags:sel, dur});
  drafts = drafts.slice(0, 6); renderClips();
  toast(`✂ Clip de ${Math.round(dur)} s guardado`);
}
function loadScript(u) { return new Promise((ok, no) => { const s = document.createElement('script'); s.src = u; s.onload = ok; s.onerror = no; document.head.appendChild(s); }); }
async function loadMux() {   // convertidor TS→MP4: primero tu propio dominio (vendor/), luego CDN
  if (window.muxjs) return;
  for (const u of ['vendor/mux.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/mux.js/7.0.3/mux.min.js', 'https://cdn.jsdelivr.net/npm/mux.js@7.0.3/dist/mux.min.js']) {
    try { await loadScript(u); if (window.muxjs) return; } catch {}
  }
  throw new Error('no se pudo cargar el convertidor');
}

/* Reescribe los timestamps (PTS/DTS/PCR) de los segmentos TS para que el clip empiece en ~0.
   Los directos llevan horas de reloj acumulado: sin esto el archivo "dura 8 horas" y no se reproduce. */
const P33 = 2 ** 33;
const rdTs = (u, i) => ((u[i] >> 1) & 7) * 2 ** 30 + (u[i + 1] << 22) + ((u[i + 2] >> 1) << 15) + (u[i + 3] << 7) + (u[i + 4] >> 1);
function wrTs(u, i, ts) {
  ts = ((ts % P33) + P33) % P33;
  u[i] = (u[i] & 0xF0) | ((Math.floor(ts / 2 ** 30) & 7) << 1) | 1;
  u[i + 1] = Math.floor(ts / 2 ** 22) & 0xFF;
  u[i + 2] = ((Math.floor(ts / 2 ** 15) & 0x7F) << 1) | 1;
  u[i + 3] = Math.floor(ts / 2 ** 7) & 0xFF;
  u[i + 4] = ((ts & 0x7F) << 1) | 1;
}
function tsWalk(u, fn) {
  for (let p = 0; p + 188 <= u.length; p += 188) {
    if (u[p] !== 0x47) continue;
    const afc = (u[p + 3] >> 4) & 3; let o = p + 4;
    if (afc & 2) { const len = u[p + 4]; if (len >= 7 && (u[p + 5] & 0x10)) fn('pcr', p + 6, u); o += 1 + len; }
    if ((afc & 1) && (u[p + 1] & 0x40) && o + 14 <= p + 188 && u[o] === 0 && u[o + 1] === 0 && u[o + 2] === 1) {
      const fl = u[o + 7] >> 6; if (fl & 2) fn('pts', o + 9, u); if (fl === 3) fn('dts', o + 14, u);
    }
  }
}
const rdPcr = (u, i) => u[i] * 2 ** 25 + u[i + 1] * 2 ** 17 + u[i + 2] * 2 ** 9 + u[i + 3] * 2 + (u[i + 4] >> 7);
function tsRebase(chunks) {   // ArrayBuffer[] → Uint8Array (mismas longitudes, timestamps desde ~0,1 s)
  const arr = chunks.map(c => new Uint8Array(c.slice(0))); let min = Infinity;
  arr.forEach(u => tsWalk(u, (k, i) => { const t = k === 'pcr' ? rdPcr(u, i) : rdTs(u, i); if (t < min) min = t; }));
  if (!isFinite(min)) min = 0;
  const base = 9000;
  arr.forEach(u => tsWalk(u, (k, i) => {
    if (k === 'pcr') {
      const ext = ((u[i + 4] & 1) << 8) | u[i + 5]; let b = ((rdPcr(u, i) - min + base) % P33 + P33) % P33;
      u[i] = Math.floor(b / 2 ** 25) & 0xFF; u[i + 1] = Math.floor(b / 2 ** 17) & 0xFF; u[i + 2] = Math.floor(b / 2 ** 9) & 0xFF; u[i + 3] = Math.floor(b / 2) & 0xFF;
      u[i + 4] = ((b & 1) << 7) | 0x7E | ((ext >> 8) & 1); u[i + 5] = ext & 0xFF;
    } else wrTs(u, i, rdTs(u, i) - min + base);
  }));
  const out = new Uint8Array(arr.reduce((s, u) => s + u.length, 0)); let p = 0; arr.forEach(u => { out.set(u, p); p += u.length; });
  return out;
}
async function toMp4(u8) {   // u8 = TS ya reescrito con tsRebase()
  await loadMux();
  const t = new muxjs.mp4.Transmuxer({keepOriginalTimestamps:false, baseMediaDecodeTime:0}); let init = null; const parts = [];
  t.on('data', s => { if (!init) init = s.initSegment; parts.push(s.data); });
  t.push(u8); t.flush();                 // mux.js es síncrono: aquí ya salieron todos los datos
  if (!init || !parts.length) throw new Error('conversión vacía');
  return new Blob([init, ...parts], {type:'video/mp4'});
}
const stamp = d => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };

/* ---------- Lista y editor de clips ---------- */
function renderClips() {
  $('#clips').textContent = '🎞' + (drafts.length ? ' ' + drafts.length : '');
  $('#clist').innerHTML = drafts.length
    ? drafts.map(d => `<div class="citem"><div><b>${esc(d.name)}</b><small>${d.at.toLocaleTimeString('es')} · ${Math.round(d.dur)} s</small></div><button data-e="${d.id}">Editar</button><button data-q="${d.id}" aria-label="Borrar">✕</button></div>`).join('')
    : '<p class="mh" style="padding:12px 16px">Aún no hay clips. Toca ✂ en el reproductor para guardar los últimos segundos.</p>';
  document.querySelectorAll('#cdur button').forEach(b => b.classList.toggle('on', +b.dataset.d === clipDur));
}
function edClose() {
  const cv = $('#cvid'); cv.pause();
  if (ed) { if (ed.hls) ed.hls.destroy(); if (ed.url) URL.revokeObjectURL(ed.url); ed.urls.forEach(u => URL.revokeObjectURL(u)); }
  cv.removeAttribute('src'); cv.load(); ed = null;
}
function showClipList() {
  edClose(); $('#ced').hidden = true; $('#clist').hidden = false; $('#cdur').hidden = false; $('#ctitle').textContent = 'Clips'; renderClips();
}
const edT = () => ed.b[ed.b.length - 1];
function tlPaint(fs, fe) {   // fs/fe: posiciones libres (s) solo para dibujar mientras se arrastra; el texto muestra el corte real
  const T = edT(), l = (fs ?? ed.b[ed.s]) / T * 100, r = (fe ?? ed.b[ed.e]) / T * 100;
  $('#tlsel').style.left = l + '%'; $('#tlsel').style.width = (r - l) + '%';
  $('#tlh1').style.left = l + '%'; $('#tlh2').style.left = r + '%';
  $('#ctime').textContent = mmss(ed.b[ed.s]) + ' – ' + mmss(ed.b[ed.e]); $('#clen').textContent = Math.round(ed.b[ed.e] - ed.b[ed.s]) + ' s';
}
function tlDrag(which, ev) {
  if (!ed) return; ev.preventDefault();
  const bar = $('#tlbar'), h = ev.currentTarget, cv = $('#cvid'); h.setPointerCapture(ev.pointerId);
  bar.classList.remove('snap'); ed.drag = true;
  const move = e => {
    const r = bar.getBoundingClientRect(), t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * edT();
    let k = 0, best = 1e9; ed.b.forEach((x, i) => { const d = Math.abs(x - t); if (d < best) { best = d; k = i; } });
    if (which === 1) ed.s = Math.min(k, ed.e - 1); else ed.e = Math.max(k, ed.s + 1);
    // el control sigue al dedo con libertad (sin saltos); el corte real se ajusta al soltar
    const fs = which === 1 ? Math.min(t, ed.b[ed.e - 1]) : ed.b[ed.s], fe = which === 2 ? Math.max(t, ed.b[ed.s + 1]) : ed.b[ed.e];
    tlPaint(fs, fe); cv.currentTime = which === 1 ? fs : Math.max(fs, fe - 0.3);
  };
  const up = () => {
    h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up);
    if (!ed) return; ed.drag = false; bar.classList.add('snap'); tlPaint();   // se acomoda con una animación corta
    cv.currentTime = ed.b[ed.s];
  };
  h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
}
function vodPreview() {   // vista previa de respaldo: HLS local con los mismos segmentos (la reproducción normal ya demostró que funcionan)
  const sizes = ed.d.frags.map(x => x.data.byteLength); let o = 0;
  let pl = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:' + Math.ceil(Math.max(...ed.d.frags.map(f => f.dur))) + '\n#EXT-X-MEDIA-SEQUENCE:0\n';
  ed.d.frags.forEach((f, i) => { const u = URL.createObjectURL(new Blob([ed.ts.subarray(o, o + sizes[i])], {type:'video/mp2t'})); ed.urls.push(u); o += sizes[i]; pl += `#EXTINF:${f.dur.toFixed(3)},\n${u}\n`; });
  const pu = URL.createObjectURL(new Blob([pl + '#EXT-X-ENDLIST\n'], {type:'application/vnd.apple.mpegurl'})); ed.urls.push(pu);
  const cv = $('#cvid'); cv.removeAttribute('src');
  if (window.Hls && Hls.isSupported()) { ed.hls = new Hls({enableWorker:false}); ed.hls.loadSource(pu); ed.hls.attachMedia(cv); } else cv.src = pu;
}
async function openEditor(id) {
  const d = drafts.find(x => x.id === id); if (!d) return;
  const b = [0]; d.frags.forEach(f => b.push(b[b.length - 1] + f.dur));
  ed = {d, b, s:0, e:d.frags.length, url:'', urls:[], hls:null, useTs:false, ts:null};
  $('#clist').hidden = true; $('#cdur').hidden = true; $('#ced').hidden = false; $('#ctitle').textContent = 'Editar clip';
  $('#cname').value = ''; $('#cplay').hidden = true; tlPaint();
  const cv = $('#cvid'), mine = ed;
  ed.ts = tsRebase(d.frags.map(x => x.data)); let ok = false;
  try {
    const blob = await toMp4(ed.ts); if (ed !== mine) return;
    ed.url = URL.createObjectURL(blob); cv.src = ed.url;
    ok = await new Promise(res => {
      const t = setTimeout(() => res(false), 4000);
      cv.onloadedmetadata = () => { clearTimeout(t); res(isFinite(cv.duration) && Math.abs(cv.duration - edT()) < 4); };
      cv.onerror = () => { clearTimeout(t); res(false); };
    });
  } catch (e) { dbg('mp4: ' + e.message); }
  if (ed !== mine) return;
  if (!ok) { ed.useTs = true; if (ed.url) { URL.revokeObjectURL(ed.url); ed.url = ''; } vodPreview(); toast('Modo compatible: este clip se exportará como .ts'); }
  cv.play().catch(() => { $('#cplay').hidden = false; });
}
async function exportClip(kind) {
  if (!ed) return;
  const fr = ed.d.frags.slice(ed.s, ed.e), ts = tsRebase(fr.map(x => x.data));
  const nm = ($('#cname').value.trim() || ed.d.slug).replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]/g, '').trim().replace(/\s+/g, '-') || ed.d.slug;
  const base = nm + '-' + stamp(ed.d.at);
  let blob, ext = 'mp4';
  const asTs = () => { ext = 'ts'; return new Blob([ts], {type:'video/mp2t'}); };
  if (kind === 'ts' || ed.useTs) blob = asTs();
  else { try { blob = await toMp4(ts); } catch (e) { blob = asTs(); toast('No se pudo convertir a .mp4: se guardó como .ts'); } }
  const file = new File([blob], `${base}.${ext}`, {type:blob.type});
  if (kind === 'share' && navigator.canShare?.({files:[file]})) { try { await navigator.share({files:[file], title:nm}); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000); toast('Clip guardado (' + ext + ')');
}
$('#clip').onclick = makeClip;
$('#clips').onclick = () => { showClipList(); $('#csheet').hidden = false; };
$('#cclose').onclick = () => { showClipList(); $('#csheet').hidden = true; };
$('#cback').onclick = showClipList;
$('#cdur').addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (!b) return; clipDur = +b.dataset.d; try { localStorage.setItem('kicklite.clipdur', clipDur); } catch {} renderClips(); });
$('#clist').addEventListener('click', e => {
  const b = e.target.closest('[data-e]'), q = e.target.closest('[data-q]');
  if (b) openEditor(+b.dataset.e); else if (q) { drafts = drafts.filter(x => x.id !== +q.dataset.q); renderClips(); }
});
$('#tlh1').addEventListener('pointerdown', e => tlDrag(1, e));
$('#tlh2').addEventListener('pointerdown', e => tlDrag(2, e));
$('#tlbar').addEventListener('pointerdown', e => {
  if (!ed || e.target.classList.contains('tlh')) return;
  const r = $('#tlbar').getBoundingClientRect(), t = (e.clientX - r.left) / r.width * edT();
  $('#cvid').currentTime = Math.min(ed.b[ed.e] - 0.1, Math.max(ed.b[ed.s], t));
});
const cvEl = $('#cvid');
cvEl.addEventListener('timeupdate', () => {
  if (!ed) return;
  if (!ed.drag && (cvEl.currentTime >= ed.b[ed.e] - 0.05 || cvEl.currentTime < ed.b[ed.s] - 0.4)) cvEl.currentTime = ed.b[ed.s];
  $('#tlph').style.left = Math.min(100, cvEl.currentTime / edT() * 100) + '%';
});
cvEl.addEventListener('play', () => { $('#cplay').hidden = true; });
cvEl.addEventListener('pause', () => { $('#cplay').hidden = false; });
cvEl.addEventListener('click', () => cvEl.paused ? cvEl.play() : cvEl.pause());
$('#cplay').onclick = () => cvEl.play();
$('#cmute').onclick = () => { cvEl.muted = !cvEl.muted; $('#cmute').textContent = cvEl.muted ? '🔇' : '🔊'; };
$('#cshare').onclick = () => exportClip('share');
$('#cdl').onclick = () => exportClip('mp4');
$('#cts').onclick = () => exportClip('ts');
renderClips();

/* ---------- Iniciar sesión con Kick y escribir en el chat (opcional: requiere api/auth.js + app de Kick) ---------- */
const AUTHLS = 'kicklite.auth'; let AUTH = {enabled:false, clientId:''}, pane = 'chat';
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jpost = (action, body) => fetch('/api/auth?action=' + action + kq(), {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
const saveTok = j => { const t = {access:j.access_token, refresh:j.refresh_token, exp:Date.now() + (j.expires_in || 3600) * 1000}; localStorage.setItem(AUTHLS, JSON.stringify(t)); return t; };
function paintAuth() {
  const logged = !!localStorage.getItem(AUTHLS);
  $('#cbar').hidden = !AUTH.enabled || pane !== 'chat'; $('#login').hidden = logged; $('#cform').hidden = !logged;
}
async function authInit() {
  try { AUTH = await (await fetch('/api/auth?action=config' + kq())).json(); } catch {}
  const p = new URLSearchParams(location.search), code = p.get('code');
  if (code && sessionStorage.getItem('kl.verifier')) {
    try {
      if (p.get('state') !== sessionStorage.getItem('kl.state')) throw new Error('estado');
      const r = await jpost('token', {code, verifier:sessionStorage.getItem('kl.verifier'), redirect:location.origin + '/'});
      if (!r.ok) throw new Error('token ' + r.status); saveTok(await r.json()); toast('Sesión iniciada');
    } catch (e) { toast('No se pudo iniciar sesión (' + e.message + ')'); }
    sessionStorage.removeItem('kl.verifier'); history.replaceState({}, '', '/');
  }
  paintAuth();
}
async function login() {
  const ver = b64u(crypto.getRandomValues(new Uint8Array(48))), st = b64u(crypto.getRandomValues(new Uint8Array(12)));
  const ch = b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ver)));
  sessionStorage.setItem('kl.verifier', ver); sessionStorage.setItem('kl.state', st);
  location.href = 'https://id.kick.com/oauth/authorize?' + new URLSearchParams({response_type:'code', client_id:AUTH.clientId, redirect_uri:location.origin + '/', scope:'user:read chat:write', code_challenge:ch, code_challenge_method:'S256', state:st});
}
async function getToken(force) {
  let t = null; try { t = JSON.parse(localStorage.getItem(AUTHLS)); } catch {}
  if (!t) return '';
  if (force || Date.now() > t.exp - 30000) {
    const r = await jpost('refresh', {refresh:t.refresh});
    if (!r.ok) { localStorage.removeItem(AUTHLS); paintAuth(); return ''; }
    t = saveTok(await r.json());
  }
  return t.access;
}
async function sendChat(text) {
  if (!cur?.uid) throw new Error('canal sin id');
  for (let i = 0; i < 2; i++) {
    const tok = await getToken(i === 1); if (!tok) throw new Error('inicia sesión de nuevo');
    const r = await jpost('send', {token:tok, uid:cur.uid, content:text});
    if (r.status === 401 && i === 0) continue;
    if (!r.ok) throw new Error('Kick respondió ' + r.status);
    return;
  }
}
$('#login').onclick = login;
$('#logout').onclick = () => { localStorage.removeItem(AUTHLS); paintAuth(); toast('Sesión cerrada'); };
$('#cform').addEventListener('submit', async e => {
  e.preventDefault(); const t = $('#cin').value.trim(); if (!t) return; $('#cin').value = ''; $('#emop').hidden = true;
  try { await sendChat(t); } catch (err) { toast('No se pudo enviar: ' + err.message); $('#cin').value = t; }
});

/* ---------- Selector de emotes (toca uno y se inserta como [emote:ID:nombre]) ---------- */
const emoCache = {};
async function loadEmotes(slug) {
  if (emoCache[slug]) return emoCache[slug];
  const j = await kick('/emotes/' + encodeURIComponent(slug)), groups = [];
  (Array.isArray(j) ? j : []).forEach(g => {
    const list = (Array.isArray(g.emotes) ? g.emotes : (g.id && g.name ? [g] : [])).filter(e => +e.id && e.name);
    if (list.length) groups.push({label: g.name || (g.slug === slug ? 'Del canal' : g.slug) || 'Emotes', list});
  });
  return groups.length ? (emoCache[slug] = groups) : groups;
}
async function toggleEmotes() {
  const p = $('#emop'); if (!p.hidden) { p.hidden = true; return; }
  if (!cur) return; p.hidden = false; p.textContent = 'Cargando emotes…';
  try {
    const gs = await loadEmotes(cur.slug);
    if (!gs.length) { p.textContent = 'No se encontraron emotes para este canal.'; return; }
    p.innerHTML = gs.map(g => `<h4>${esc(g.label)}</h4><div class="eg">` + g.list.map(e =>
      `<button type="button" data-id="${+e.id}" data-n="${esc(e.name)}" title="${esc(e.name)}"${e.subscribers_only ? ' class="sub"' : ''}><img loading="lazy" src="https://files.kick.com/emotes/${+e.id}/fullsize" alt="${esc(e.name)}"></button>`).join('') + '</div>').join('');
  } catch (e) { p.textContent = 'No se pudieron cargar los emotes (' + e.message + ')'; }
}
$('#cemo').onclick = toggleEmotes;
$('#emop').addEventListener('click', e => {
  const b = e.target.closest('button[data-id]'); if (!b) return;
  const i = $('#cin'), tok = `[emote:${b.dataset.id}:${b.dataset.n}] `, a = i.selectionStart ?? i.value.length, z = i.selectionEnd ?? a;
  if (i.value.length + tok.length > 500) return toast('El mensaje es demasiado largo');
  i.value = i.value.slice(0, a) + tok + i.value.slice(z); i.focus(); i.setSelectionRange(a + tok.length, a + tok.length);
});

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
  $('#chat').hidden = b.dataset.pane !== 'chat'; $('#morepane').hidden = b.dataset.pane === 'chat'; pane = b.dataset.pane; paintAuth();
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

authInit();
load();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js');

/* ---------- Aviso de versión nueva: compara cada minuto la "huella" (ETag) de los archivos de la app ---------- */
const WATCH = ['index.html', 'app.js', 'style.css'];
let sig0 = null, updShown = false;
async function sigNow() {
  try {
    const hs = await Promise.all(WATCH.map(async f => { const r = await fetch(f, {method:'HEAD', cache:'no-store'}); return r.headers.get('etag') || r.headers.get('last-modified') || ''; }));
    return hs.join('|').replace(/\|/g, '') ? hs.join('|') : null;
  } catch { return null; }
}
function showUpdate() {
  if (updShown) return; updShown = true;
  const d = document.createElement('div'); d.className = 'upd';
  d.innerHTML = '<span></span><button>Actualizar</button><button class="x" aria-label="Cerrar">✕</button>';
  d.firstChild.textContent = 'Estamos haciendo cambios, por favor refresca la página.' + (drafts.length ? ' Antes descarga tus clips: se pierden al refrescar.' : '');
  d.children[1].onclick = () => location.reload();
  d.children[2].onclick = () => { d.remove(); setTimeout(() => updShown = false, 5 * 60000); };
  document.body.appendChild(d);
}
async function checkUpdate() {
  const s = await sigNow(); if (!s) return;
  if (sig0 === null) sig0 = s; else if (s !== sig0) showUpdate();
}
checkUpdate(); setInterval(checkUpdate, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });
