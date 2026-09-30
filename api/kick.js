// Proxy para Vercel (Serverless Function) → https://TU-APP.vercel.app/api/kick?path=/api/v2/channels/xqc
// Kick no envía cabeceras CORS, así que el navegador no puede llamarlo directo.
// AVISO: Cloudflare puede bloquear IPs de servidores; si ves 403, prueba otra región/host
// o usa la API oficial de Kick (https://docs.kick.com) con OAuth.
export default async function handler(req, res) {
  const p = String(req.query.path || '');
  const ok = /^\/(api\/v[12]\/channels\/[\w-]+|stream\/livestreams\/\w+|api\/search)(\?[\w=&%-]*)?$/.test(p);
  if (!ok) return res.status(400).json({ error: 'path no permitido' });
  try {
    const r = await fetch('https://kick.com' + p, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36' }
    });
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.status(r.status).setHeader('Content-Type', 'application/json').send(await r.text());
  } catch { res.status(502).json({ error: 'fallo al contactar con Kick' }); }
}
