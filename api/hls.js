// Proxy de video (Vercel): /api/hls?u=<URL https del .m3u8 o segmento>. Solo plan B.
// Solo permite los dominios de video de Kick (antes aceptaba cualquier amazonaws/cloudfront).
const OK_HOST = /^(stream\.kick\.com|([\w-]+\.)*live-video\.net)$/;
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36';

// ---- Protección básica (mismo código en api/kick.js y api/hls.js) ----
// 1) Solo acepta peticiones hechas desde tu propia página (Sec-Fetch-Site).
// 2) Si defines la variable ACCESS_CODE en Vercel, exige ese código (?k=...).
// 3) Límite de peticiones por IP y minuto (mejor esfuerzo).
const hits = new Map();
function guard(req, res, limit) {
  const site = req.headers["sec-fetch-site"];
  if (site && site !== "same-origin" && site !== "none") { res.status(403).end(); return false; }
  const code = process.env.ACCESS_CODE;
  if (code && req.query.k !== code) { res.status(401).json({ error: "codigo" }); return false; }
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "x";
  const m = Math.floor(Date.now() / 60000), key = ip + ":" + m;
  const n = (hits.get(key) || 0) + 1; hits.set(key, n);
  if (hits.size > 2000) for (const k of hits.keys()) if (!k.endsWith(":" + m)) hits.delete(k);
  if (n > limit) { res.status(429).end(); return false; }
  return true;
}

export default async function handler(req, res) {
  if (!guard(req, res, 400)) return;
  let url;
  try { url = new URL(String(req.query.u || '')); } catch { return res.status(400).end(); }
  if (url.protocol !== 'https:' || !OK_HOST.test(url.hostname)) return res.status(403).end();
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Origin: 'https://kick.com', Referer: 'https://kick.com/' } });
    const isList = /\.m3u8$/i.test(url.pathname) || /mpegurl/i.test(r.headers.get('content-type') || '');
    res.setHeader('Cache-Control', isList ? 'no-store' : 's-maxage=60');
    if (isList) {
      let txt = await r.text();
      if (req.query.r === '1') { // reescribe rutas para reproductores nativos (Safari antiguo)
        const kq = req.query.k ? '&k=' + encodeURIComponent(req.query.k) : '';
        const prox = l => '/api/hls?r=1' + kq + '&u=' + encodeURIComponent(new URL(l, url).href);
        txt = txt.split('\n').map(l => l.startsWith('#') ? l.replace(/URI="([^"]+)"/g, (_, u) => `URI="${prox(u)}"`) : (l.trim() ? prox(l.trim()) : l)).join('\n');
      }
      return res.status(r.status).setHeader('Content-Type', 'application/vnd.apple.mpegurl').send(txt);
    }
    res.status(r.status).setHeader('Content-Type', r.headers.get('content-type') || 'application/octet-stream').send(Buffer.from(await r.arrayBuffer()));
  } catch { res.status(502).end(); }
}
