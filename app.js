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
const toggleFav = s => { const f = getFavs(); localStorage.setItem(LS, JSON.stringify(f.includes(s) ? f.filter(x => x !== s) : [...f, s])); };

/* ---------- API ---------- */
async function kick(path) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 12000);
  try {
    const r = await fetch(PROXY + encodeURIComponent(path), {signal: ac.signal});
    if (!r.ok) throw new Error('El proxy respondió ' + r.status);
    return await r.json();
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'tiempo de espera agotado' : e.message); }
  finally { clearTimeout(t); }
}
const img = x => typeof x === 'string' ? x : (x?.src || x?.url || '');
function fromChannel(c) {
  const ls = c.livestream;
  return { slug:c.slug, name:c.user?.username || c.slug, avatar:c.user?.profile_pic || '', live:!!ls,
    title:ls?.session_title || '', game:ls?.categories?.[0]?.name || '', viewers:ls?.viewer_count || 0,
    thumb:img(ls?.thumbnail), hls:c.playback_url || '', since:ls?.created_at || ls?.start_time || '' };
}
function fromLive(x) {
  return { slug:x.channel?.slug, name:x.channel?.user?.username || x.channel?.slug,
    avatar:x.channel?.profile_picture || x.channel?.user?.profile_pic || '', live:true,
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
const avatar = s => s.avatar ? `<img src="${esc(s.avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
function card(s) {
  const th = s.thumb ? `<img src="${esc(s.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
  return `<li class="card" data-slug="${esc(s.slug)}">
    <div class="th">${th}${s.live ? `<span class="badge">EN VIVO</span><span class="vw">${fmt(s.viewers)}</span>` : '<span class="badge off">OFFLINE</span>'}</div>
    <div class="meta"><div class="av">${avatar(s)}</div>
      <div class="info"><div class="t">${esc(s.live ? s.title : 'Sin transmisión')}</div><div class="m">${esc(s.name)}${s.game ? ' · ' + esc(s.game) : ''}</div></div>
      <button class="fav ${isFav(s.slug) ? 'on' : ''}" data-fav="${esc(s.slug)}" aria-label="Favorito">${isFav(s.slug) ? '♥' : '♡'}</button></div></li>`;
}
function show(items, msg, retry) {
  items.forEach(s => cache[s.slug] = {...cache[s.slug], ...s});
  $('#list').innerHTML = items.map(card).join('');
  $('#empty').hidden = items.length > 0;
  $('#empty p').textContent = msg || '';
  $('#reload').hidden = !retry;
}
const banner = m => { $('#banner').hidden = !m; $('#banner').textContent = m || ''; };

async function load() {
  $('#title').textContent = {live:'Más vistos', favs:'Favoritos', search:'Buscar'}[tab];
  $('#chips').hidden = tab !== 'live'; document.body.classList.toggle('sr', tab !== 'live');
  $('#searchForm').hidden = tab !== 'search';
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
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
  const behind = hls && hls.liveSyncPosition ? hls.liveSyncPosition - v.currentTime > 6 : false;
  $('#golive').classList.toggle('behind', behind);
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
  try { const c = await getChannel(slug); if (cur?.slug !== slug) return; cur = {...cur, ...c}; paintInfo(); }
  catch (e) { dbg('canal', e.message); return giveUp(); }
  if (!cur.live || !cur.hls) { dbg('sin url de video', cur.live); return giveUp(); }
  dbg('url', cur.hls);
  startStream();
  try { wake = await navigator.wakeLock?.request('screen'); } catch {}
}
function startStream() {
  clearTimeout(watch); $('#retry').hidden = true;
  if (hls) { hls.destroy(); hls = null; }
  watch = setTimeout(() => next('sin respuesta en 12 s'), 12000);
  if (window.Hls && Hls.isSupported()) {          // Android / Chrome / Firefox / iOS 17.1+
    const cfg = {lowLatencyMode:false, maxBufferLength:20, backBufferLength:30, manifestLoadingMaxRetry:1, fragLoadingMaxRetry:3};
    if (mode === 'proxy') cfg.xhrSetup = (xhr, url) => xhr.open('GET', HLSPROXY + encodeURIComponent(url), true);
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
    v.src = mode === 'proxy' ? '/api/hls?r=1&u=' + encodeURIComponent(cur.hls) : cur.hls; play2();
  }
}
function play2() { v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); }
function stop(keepUI) {
  clearTimeout(watch); clearInterval(upT);
  v.onerror = null; v.pause(); v.removeAttribute('src'); v.load();
  if (hls) { hls.destroy(); hls = null; }
  $('#retry').hidden = true; $('#dbg').hidden = true;
  wake?.release?.().catch?.(() => {}); wake = null;
  if (!keepUI) { $('#player').hidden = true; document.body.style.overflow = ''; cur = null; if (document.fullscreenElement) document.exitFullscreen(); }
}

/* ---------- Eventos ---------- */
['play', 'pause', 'volumechange', 'timeupdate'].forEach(e => v.addEventListener(e, paintP));
v.addEventListener('playing', () => { clearTimeout(watch); ovShow(); });
$('#stage').addEventListener('click', e => { if (e.target.closest('button,select,input')) return; $('#ov').classList.contains('hide') ? ovShow() : $('#ov').classList.add('hide'); });
$('#pp').onclick = () => { v.paused ? v.play() : v.pause(); ovShow(); };
$('#mute').onclick = () => { v.muted = !v.muted; ovShow(); };
$('#vol').oninput = e => { v.volume = +e.target.value; v.muted = v.volume === 0; };
$('#golive').onclick = () => { const e = hls?.liveSyncPosition ?? (v.seekable.length ? v.seekable.end(v.seekable.length - 1) : 0); if (e) v.currentTime = e; v.play(); };
$('#qual').onchange = e => { if (hls) hls.currentLevel = +e.target.value; };
$('#fs').onclick = () => { const st = $('#stage'); if (document.fullscreenElement) document.exitFullscreen(); else if (st.requestFullscreen) st.requestFullscreen(); else v.webkitEnterFullscreen?.(); };
$('#pip').onclick = () => { if (document.pictureInPictureEnabled) document.pictureInPictureElement ? document.exitPictureInPicture() : v.requestPictureInPicture().catch(() => {}); else v.webkitSetPresentationMode?.('picture-in-picture'); };
$('#close').onclick = () => stop();
$('#pfav').onclick = () => { toggleFav(cur.slug); paintInfo(); };
$('#reload').onclick = load;
$('#retry').onclick = () => cur && play(cur.slug);

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
