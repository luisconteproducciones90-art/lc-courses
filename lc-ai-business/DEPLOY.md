# Despliegue en un subdominio (ej. `ai.demoslcsystem.…`)

LC-AI BUSINESS es **un solo servicio Node.js** que sirve la API y la interfaz desde el mismo origen, más una base **PostgreSQL**. No es un sitio estático: necesita un hosting que ejecute Node (no sirve el hosting compartido tipo cPanel solo-PHP/HTML).

> Reemplazá `ai.TU-DOMINIO` por el subdominio real que elijas bajo tu dominio de demos.

## Opción A — Render / Railway / similar (lo más simple)
1. Subí esta carpeta (`lc-ai-business/`) a un repo de GitHub (ya está en `lc-courses/lc-ai-business`).
2. En Render: **New → Blueprint** y apuntá a `lc-ai-business/render.yaml`. Crea el servicio y la base.
3. Completá las variables marcadas: `PUBLIC_URL=https://ai.TU-DOMINIO`, `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD` (y la clave de IA si querés un modelo real). `JWT_SECRET` y `ENCRYPTION_KEY` se generan solas: **copiá `ENCRYPTION_KEY` a un lugar seguro**; si se pierde, los tokens de WhatsApp guardados dejan de ser legibles.
4. Primera vez: en el servicio abrí **Shell** y ejecutá `node src/db/seed.js` (crea planes, empresa demo y SUPER ADMIN). Las migraciones corren solas al iniciar.
5. **Dominio**: en Render → *Custom Domains* → agregá `ai.TU-DOMINIO`. En tu DNS creá:
   | Tipo | Nombre | Valor |
   |---|---|---|
   | CNAME | `ai` | el host que te indica Render (`xxxx.onrender.com`) |
   HTTPS se emite automáticamente.

## Opción B — VPS propio con Docker
```bash
cd lc-ai-business
cp .env.example .env        # completar
docker compose up -d --build
docker compose exec app node src/db/seed.js
```
Poné Caddy o Nginx delante para el HTTPS. Caddy (`/etc/caddy/Caddyfile`):
```
ai.TU-DOMINIO {
  reverse_proxy 127.0.0.1:4000
}
```
DNS: registro **A** `ai` → IP del VPS.

## Opción C — Node sin Docker
```bash
cd backend && npm ci --omit=dev
NODE_ENV=production DATABASE_URL=... JWT_SECRET=... PUBLIC_URL=https://ai.TU-DOMINIO node src/server.js
```

## Canales y cobros (después del despliegue)
- **Widget web**: en *Integraciones* copiá el `<script>` y pegalo en el sitio del cliente. Funciona desde cualquier dominio (se puede restringir a una lista de sitios).
- **WhatsApp (API oficial de Meta)**: en *Integraciones → WhatsApp* cargá Phone number ID, token y app secret; copiá la **URL del webhook** y el **token de verificación** en la app de Meta (Webhooks → campo `messages`). La URL debe ser pública con HTTPS, es decir, ya con el subdominio funcionando.
- **Mercado Pago (suscripciones de LC-AI)**: definí `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` y configurá en Mercado Pago la notificación `https://ai.TU-DOMINIO/api/webhooks/mercadopago` (tema *subscription_preapproval*). Mientras los planes no tengan precio (se fija en *SUPER ADMIN → Planes*), el cambio de plan se solicita a LC-SYSTEM y se registra el pago manual.
- **Ecosistema LC**: ver `docs/API-ECOSISTEMA.md`.

## Base de datos (importante)
- El usuario de la BD **no debe ser superusuario ni `BYPASSRLS`**: la separación entre empresas se apoya en Row-Level Security. En producción la app **se niega a iniciar** si detecta lo contrario.
- Con Postgres administrado (Render, Supabase, Neon) el usuario de la app ya cumple. Con Postgres propio:
  ```sql
  CREATE ROLE lc_ai LOGIN PASSWORD '...' NOSUPERUSER NOBYPASSRLS;
  CREATE DATABASE lc_ai_business OWNER lc_ai;
  ```

## Variables de entorno
Ver `.env.example`. Las **claves de IA viven solo en el servidor**. Sin clave, `AI_PROVIDER=mock` usa el modo simulado offline (suficiente para mostrar la demo, pero no es un modelo real: para impresionar a un cliente conviene configurar `ANTHROPIC_API_KEY` u `OPENAI_API_KEY`).

## Checklist antes de mostrarlo a clientes
- [ ] `PUBLIC_URL` con `https://` y el subdominio exacto (lo usa el control de CSRF/Origin).
- [ ] `JWT_SECRET` aleatorio de 48+ bytes y `SUPERADMIN_PASSWORD` fuerte.
- [ ] `node src/db/seed.js` ejecutado → `https://ai.TU-DOMINIO/demo` funciona.
- [ ] Probar registro, creación de agente, subida de documento y chat.
- [ ] Backups automáticos de la base activados en el proveedor.
- [ ] `ENCRYPTION_KEY` definida y resguardada.
- [ ] Clave de IA real configurada y límite de gasto fijado en el proveedor (la demo pública consume tokens).
