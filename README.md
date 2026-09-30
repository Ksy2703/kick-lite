# Kick Lite (PWA)

## Probar en local
    npx serve .        # o: python3 -m http.server 8080
(Sin proxy verás el MODO DEMO con streams de prueba.)

## Alojar gratis
**Vercel (recomendado: incluye el proxy api/kick.js)**
1. Sube esta carpeta a un repo de GitHub.
2. vercel.com → Add New → Project → importa el repo → Deploy.
3. Abre https://TU-APP.vercel.app en el móvil.

**Netlify / GitHub Pages** solo sirven archivos estáticos: la app abrirá en modo demo.
Para datos reales, despliega api/kick.js en Vercel o un Cloudflare Worker y cambia `PROXY` en app.js
a esa URL completa (ej. 'https://tu-app.vercel.app/api/kick?path=').

## Instalar
- iOS: Safari → Compartir → "Agregar a pantalla de inicio".
- Android: Chrome → menú ⋮ → "Instalar aplicación".
Requiere HTTPS (todos los hosts anteriores lo dan).

## Seguridad para compartir
1. Vercel → tu proyecto → Settings → Environment Variables → añade ACCESS_CODE con un código (ej. "panda-2026") → Deployments → Redeploy.
   La app pedirá el código una sola vez en cada dispositivo. Para dejar fuera a alguien, cambia el código y vuelve a desplegar.
2. No publiques el enlace. vercel.json + robots.txt piden a los buscadores que no lo indexen.
3. Si ves mucho consumo, revisa Vercel → Usage.
