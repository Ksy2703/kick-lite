// Proxy de imágenes (Vercel): /api/img?u=<URL https de una imagen de kick.com>
// Plan B: solo se usa cuando el navegador no puede cargar la imagen directamente.
const OK_HOST = /^([\w-]+\.)*kick\.com$/;
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36';
const hits = new Map();
function guard(req, res, limit) {
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') { res.status(403).end(); return false; }
  const code = process.env.ACCESS_CODE;
  if (code && req.query.k !== code) { res.status(401).end(); return false; }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
  const m = Math.floor(Date.now() / 60000), key = ip + ':' + m;
  const n = (hits.get(key) || 0) + 1; hits.set(key, n);
  if (hits.size > 2000) for (const k of hits.keys()) if (!k.endsWith(':' + m)) hits.delete(k);
  if (n > limit) { res.status(429).end(); return false; }
  return true;
}
export default async function handler(req, res) {
  if (!guard(req, res, 300)) return;
  let url;
  try { url = new URL(String(req.query.u || '')); } catch { return res.status(400).end(); }
  if (url.protocol !== 'https:' || !OK_HOST.test(url.hostname)) return res.status(403).end();
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://kick.com/', Accept: 'image/*' } });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !type.startsWith('image/')) return res.status(r.ok ? 415 : r.status).end();
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    res.status(200).setHeader('Content-Type', type).send(Buffer.from(await r.arrayBuffer()));
  } catch { res.status(502).end(); }
}
