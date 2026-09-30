// Proxy de video para Vercel: /api/hls?u=<URL https del .m3u8 o segmento>
// Se usa solo como plan B cuando el navegador no puede pedir el video directo (CORS / bloqueos).
const OK_HOST = /(^|\.)(kick\.com|live-video\.net|ivs\.rocks|cloudfront\.net|amazonaws\.com)$/;
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36';
export default async function handler(req, res) {
  let url;
  try { url = new URL(String(req.query.u || '')); } catch { return res.status(400).end(); }
  if (url.protocol !== 'https:' || !OK_HOST.test(url.hostname)) return res.status(403).end();
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Origin: 'https://kick.com', Referer: 'https://kick.com/' } });
    const isList = /\.m3u8$/i.test(url.pathname) || /mpegurl/i.test(r.headers.get('content-type') || '');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', isList ? 'no-store' : 's-maxage=60');
    if (isList) {
      let txt = await r.text();
      if (req.query.r === '1') { // reescribe rutas para reproductores nativos (Safari antiguo)
        const prox = l => '/api/hls?r=1&u=' + encodeURIComponent(new URL(l, url).href);
        txt = txt.split('\n').map(l => l.startsWith('#') ? l.replace(/URI="([^"]+)"/g, (_, u) => `URI="${prox(u)}"`) : (l.trim() ? prox(l.trim()) : l)).join('\n');
      }
      return res.status(r.status).setHeader('Content-Type', 'application/vnd.apple.mpegurl').send(txt);
    }
    res.status(r.status).setHeader('Content-Type', r.headers.get('content-type') || 'application/octet-stream').send(Buffer.from(await r.arrayBuffer()));
  } catch { res.status(502).end(); }
}
