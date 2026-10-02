// Inicio de sesión con Kick (OAuth 2.1 + PKCE) y envío de mensajes al chat. OPCIONAL.
// Variables en Vercel: KICK_CLIENT_ID y KICK_CLIENT_SECRET (de tu app en kick.com/settings/developer).
// El servidor NO guarda tokens: solo intercambia códigos y reenvía mensajes.
const hits = new Map();
function guard(req, res, limit) {
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') { res.status(403).end(); return false; }
  const code = process.env.ACCESS_CODE;
  if (code && req.query.k !== code) { res.status(401).json({ error: 'codigo' }); return false; }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
  const m = Math.floor(Date.now() / 60000), key = ip + ':' + m;
  const n = (hits.get(key) || 0) + 1; hits.set(key, n);
  if (hits.size > 2000) for (const k of hits.keys()) if (!k.endsWith(':' + m)) hits.delete(k);
  if (n > limit) { res.status(429).end(); return false; }
  return true;
}
export default async function handler(req, res) {
  if (!guard(req, res, 60)) return;
  const id = process.env.KICK_CLIENT_ID, secret = process.env.KICK_CLIENT_SECRET, a = req.query.action;
  if (a === 'config') return res.status(200).json({ enabled: !!(id && secret), clientId: id || '' });
  if (!id || !secret) return res.status(501).json({ error: 'no configurado' });
  if (req.method !== 'POST') return res.status(405).end();
  let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } } b = b || {};
  try {
    if (a === 'token' || a === 'refresh') {
      const p = new URLSearchParams(a === 'token'
        ? { grant_type: 'authorization_code', client_id: id, client_secret: secret, redirect_uri: String(b.redirect || ''), code_verifier: String(b.verifier || ''), code: String(b.code || '') }
        : { grant_type: 'refresh_token', client_id: id, client_secret: secret, refresh_token: String(b.refresh || '') });
      const r = await fetch('https://id.kick.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: p });
      return res.status(r.status).setHeader('Content-Type', 'application/json').send(await r.text());
    }
    if (a === 'send') {
      const r = await fetch('https://api.kick.com/public/v1/chat', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + String(b.token || ''), 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ broadcaster_user_id: Number(b.uid), content: String(b.content || '').slice(0, 500), type: 'user' })
      });
      return res.status(r.status).setHeader('Content-Type', 'application/json').send(await r.text());
    }
  } catch { return res.status(502).json({ error: 'fallo' }); }
  res.status(400).end();
}
