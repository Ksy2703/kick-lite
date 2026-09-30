// Proxy de datos de Kick (Vercel) → /api/kick?path=/api/v2/channels/xqc
// Kick no envía cabeceras CORS, por eso las consultas pasan por aquí.

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
  if (!guard(req, res, 90)) return;
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
