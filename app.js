/* ============================================================
   Kick Lite – cliente ligero. Sin frameworks.
   IMPORTANTE: kick.com está detrás de Cloudflare y NO permite
   CORS desde navegadores. Por eso la app llama a un pequeño
   proxy propio (api/kick.js, ver README). Si el proxy no
   responde, la app cambia a MODO DEMO con datos de ejemplo.
   ============================================================ */
const PROXY = '/api/kick?path=';          // Cambia si tu proxy vive en otra URL (ej. un Cloudflare Worker)
const LS = 'kicklite.favs';
const DEMO_HLS = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'; // stream público de prueba

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let tab = 'live', demo = false, cache = {}, hls = null, current = null;

/* ---------- Favoritos (localStorage) ---------- */
const getFavs = () => { try { return JSON.parse(localStorage.getItem(LS)) || []; } catch { return []; } };
const isFav = slug => getFavs().includes(slug);
function toggleFav(slug) {
  let f = getFavs();
  f = f.includes(slug) ? f.filter(x => x !== slug) : [...f, slug];
  localStorage.setItem(LS, JSON.stringify(f));
}

/* ---------- API ---------- */
async function kick(path) {
  const r = await fetch(PROXY + encodeURIComponent(path));
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
// Normaliza la respuesta de un canal a un objeto simple
function fromChannel(c) {
  const ls = c.livestream;
  return {
    slug: c.slug, name: c.user?.username || c.slug, avatar: c.user?.profile_pic || '',
    live: !!ls, title: ls?.session_title || '', game: ls?.categories?.[0]?.name || '',
    viewers: ls?.viewer_count ?? 0, hls: c.playback_url || ''
  };
}
// Normaliza un elemento de la lista /stream/livestreams/es
function fromLive(x) {
  return {
    slug: x.channel?.slug, name: x.channel?.user?.username || x.channel?.slug,
    avatar: x.channel?.user?.profile_pic || x.channel?.profile_picture || '',
    live: true, title: x.session_title || '', game: x.categories?.[0]?.name || '',
    viewers: x.viewer_count ?? 0, hls: x.channel?.playback_url || ''
  };
}
const getChannel = async slug => fromChannel(await kick('/api/v2/channels/' + slug));

const DEMO = [
  {slug:'demo1',name:'DemoStreamer',title:'Speedrun sin ads 🔥',game:'Just Chatting',viewers:12840},
  {slug:'demo2',name:'PixelQueen',title:'Ranked hasta Diamante',game:'Valorant',viewers:5312},
  {slug:'demo3',name:'NocheLatina',title:'Charlando con el chat',game:'IRL',viewers:987},
].map(d => ({...d, avatar:'', live:true, hls:DEMO_HLS}));

/* ---------- Render ---------- */
function card(s) {
  const initial = esc(s.name[0] || '?').toUpperCase();
  return `<li class="item" data-slug="${esc(s.slug)}">
    <div class="av ${s.live ? 'live' : ''}">${s.avatar ? `<img src="${esc(s.avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<i></i>`}</div>
    <div class="info">
      <div class="row"><span class="name">${esc(s.name)}</span>${s.live ? '<span class="badge">EN VIVO</span>' : '<span class="badge off">OFFLINE</span>'}</div>
      <div class="t">${esc(s.live ? s.title : 'Sin transmisión')}</div>
      ${s.live ? `<div class="m">${esc(s.game)} · <b>${s.viewers.toLocaleString('es')} espectadores</b></div>` : ''}
    </div>
    <button class="fav ${isFav(s.slug) ? 'on' : ''}" data-fav="${esc(s.slug)}" aria-label="Favorito">${isFav(s.slug) ? '♥' : '♡'}</button>
  </li>`;
}
function show(items, emptyMsg) {
  items.forEach(s => cache[s.slug] = s);
  $('#list').innerHTML = items.map(card).join('');
  $('#empty').hidden = items.length > 0;
  $('#empty').textContent = emptyMsg || '';
}
function banner(msg) { $('#banner').hidden = !msg; $('#banner').textContent = msg || ''; }

async function load() {
  const titles = {live:'En vivo', favs:'Favoritos', search:'Buscar'};
  $('#title').textContent = titles[tab];
  $('#searchForm').hidden = tab !== 'search';
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('#list').innerHTML = ''; $('#empty').hidden = false; $('#empty').textContent = 'Cargando…';
  try {
    if (tab === 'live') {
      const j = await kick('/stream/livestreams/es');
      show((j.data || []).map(fromLive).filter(s => s.slug), 'No hay transmisiones ahora mismo.');
      banner('');
    } else if (tab === 'favs') {
      const favs = getFavs();
      if (!favs.length) return show([], 'Aún no tienes favoritos. Toca ♡ en cualquier canal para guardarlo.');
      const res = await Promise.allSettled(favs.map(getChannel));
      const items = res.map((r, i) => r.status === 'fulfilled' ? r.value
        : {slug:favs[i], name:favs[i], avatar:'', live:false, title:'', game:'', viewers:0, hls:''});
      items.sort((a, b) => b.live - a.live || b.viewers - a.viewers);
      show(items); banner('');
    } else {
      show([], 'Escribe el nombre exacto de un canal de Kick.');
    }
  } catch (e) {
    // Sin proxy → modo demo para poder probar la interfaz
    demo = true;
    banner('Modo demo: no se pudo contactar con Kick (falta desplegar el proxy api/kick.js).');
    const favs = getFavs();
    if (tab === 'favs') show(DEMO.filter(d => favs.includes(d.slug)), 'Aún no tienes favoritos.');
    else if (tab === 'live') show(DEMO);
    else show([], 'La búsqueda requiere el proxy.');
  }
}

/* ---------- Reproductor ---------- */
function play(s) {
  if (!s.live || !s.hls) { banner('Este canal no está transmitiendo ahora.'); return; }
  current = s;
  $('#pname').textContent = s.name; $('#ptitle').textContent = s.title;
  paintPFav(); $('#player').hidden = false;
  const v = $('#video');
  if (window.Hls && Hls.isSupported()) {          // Android / Chrome / Firefox
    hls = new Hls({lowLatencyMode: true});
    hls.loadSource(s.hls); hls.attachMedia(v);
  } else v.src = s.hls;                           // iOS Safari: HLS nativo
  v.play().catch(() => {});
}
function stop() {
  const v = $('#video'); v.pause(); v.removeAttribute('src'); v.load();
  if (hls) { hls.destroy(); hls = null; }
  $('#player').hidden = true; current = null;
}
function paintPFav() {
  const b = $('#pfav'), on = current && isFav(current.slug);
  b.classList.toggle('on', !!on); b.textContent = on ? '♥' : '♡';
}

/* ---------- Eventos ---------- */
$('#list').addEventListener('click', e => {
  const fb = e.target.closest('[data-fav]');
  if (fb) { toggleFav(fb.dataset.fav); if (tab === 'favs') load(); else { fb.classList.toggle('on'); fb.textContent = isFav(fb.dataset.fav) ? '♥' : '♡'; } return; }
  const li = e.target.closest('.item'); if (li) play(cache[li.dataset.slug]);
});
document.querySelector('.tabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (b) { tab = b.dataset.tab; load(); }
});
$('#searchForm').addEventListener('submit', async e => {
  e.preventDefault();
  const slug = $('#q').value.trim().toLowerCase().replace(/\s+/g, '-'); if (!slug) return;
  $('#empty').hidden = false; $('#empty').textContent = 'Buscando…'; $('#list').innerHTML = '';
  try { show([await getChannel(slug)]); }
  catch { show([], `No se encontró el canal "${slug}".`); }
});
$('#close').onclick = stop;
$('#pfav').onclick = () => { toggleFav(current.slug); paintPFav(); };

load();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js');
