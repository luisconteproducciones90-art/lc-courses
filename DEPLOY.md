# 🚀 LC-COURSES — Guía de Despliegue Completa

## 🔒 URGENTE — Reglas de Firebase Realtime Database

El sitio (`index.html`) usa una base **Firebase Realtime Database** compartida
(`lc-courses-default-rtdb.firebaseio.com`) para sincronizar en vivo los
cambios del panel de admin (cursos, cupones) entre todos los visitantes.

**La contraseña del panel de admin es solo una pantalla en el navegador — no
protege esa base de datos.** Cualquier visitante puede abrir la consola del
navegador (F12) y, si las reglas de Firebase permiten escritura pública,
reescribir directamente los datos del sitio para TODOS los visitantes, sin
necesidad de la contraseña.

**Hacé esto ahora en la [consola de Firebase](https://console.firebase.google.com/)**
→ proyecto `lc-courses` → **Realtime Database** → pestaña **Rules**:

1. Si ves reglas de "modo de prueba" como estas (o `.write: true`), **son
   inseguras** y hay que cambiarlas ya:
   ```json
   { "rules": { ".read": true, ".write": true } }
   ```

2. Reemplazalas por (permite que el sitio LEA los datos para mostrarlos a
   todos, pero bloquea toda escritura desde el navegador — el panel de admin
   client-side no podrá guardar en Firebase hasta que se migre al backend
   con autenticación real):
   ```json
   {
     "rules": {
       "lc-courses": {
         ".read": true,
         ".write": false
       }
     }
   }
   ```

3. Click **Publish**.

### Actualización — habilitar comentarios compartidos

El formulario de "¿Qué curso querés que subamos?" ahora sincroniza por
Firebase para que los comentarios de visitantes reales lleguen al panel de
admin desde cualquier dispositivo (antes solo se guardaban en el navegador
de cada visitante y el admin nunca los veía). Esto necesita un permiso de
escritura acotado **solo** a la ruta de comentarios — el resto del sitio
(cursos, precios, cupones) sigue bloqueado para escritura pública.

Reemplazá las reglas por estas (agrega el bloque `comments` con `.write:
true` y validación básica, dejando todo lo demás igual que antes):

```json
{
  "rules": {
    "lc-courses": {
      ".read": true,
      ".write": false,
      "comments": {
        ".write": true,
        "$commentId": {
          ".validate": "newData.hasChildren(['name','text','date']) && newData.child('name').isString() && newData.child('name').val().length <= 100 && newData.child('text').isString() && newData.child('text').val().length >= 5 && newData.child('text').val().length <= 1000"
        }
      },
      "commentsLocked": {
        ".write": true,
        ".validate": "newData.isBoolean()"
      }
    }
  }
}
```

`commentsLocked` es el interruptor del botón "🔒 Bloquear Comentarios" del
panel admin (Admin → Comentarios) — corta los envíos nuevos para todos los
visitantes al instante, útil si ves una ola de spam. Igual que con
`comments`, esta ruta también acepta escritura pública porque no hay
autenticación real que distinga al admin de un visitante; solo un booleano,
así que el peor caso es que alguien la prenda/apague molestando, no que
robe o corrompa datos.

**Trade-off a tener en cuenta:** como el sitio no tiene un login real (todo
corre desde el mismo navegador anónimo, sin Firebase Authentication), esta
regla no puede distinguir "un visitante dejando un comentario" de "el admin
respondiendo" — cualquiera con conocimientos de consola del navegador podría
en teoría escribir comentarios falsos o editar/borrar los existentes usando
la API de Firebase directamente. Es un riesgo mucho menor que el anterior
(no toca cursos, precios ni cupones), pero no es cero. La validación limita
qué se puede escribir (campos obligatorios, longitud), no quién escribe.
La solución completa es mover comentarios al backend con autenticación real
cuando se migre el panel de admin.

Esto corta la vía de ataque más grave (alguien reescribiendo tu sitio para
todos los visitantes). El panel de admin va a seguir funcionando en modo
"solo este navegador" (usa `localStorage`), simplemente no va a sincronizar
esos cambios a otros dispositivos hasta que el admin esté migrado al backend
real (con JWT, ya construido en `backend/`, pendiente de conectar).


## Stack

| Capa | Tecnología | Plataforma |
|------|-----------|-----------|
| Frontend | Next.js 14 + React | Vercel |
| Backend | Node.js + Express | Railway o Render |
| Base de datos | PostgreSQL 15 | Railway DB o Render DB |
| Videos / Archivos | Cloudflare R2 | Cloudflare |
| Pagos | Mercado Pago SDK | MercadoPago |
| Emails | Nodemailer + Gmail | Gmail SMTP |
| Auth social | Google OAuth 2.0 | Google Cloud |

---

## 1. Cloudflare R2 (Videos y archivos)

1. Entrá a [dash.cloudflare.com](https://dash.cloudflare.com) → **R2**
2. Crear bucket: `lc-courses-videos`
3. En **Manage R2 API Tokens** → crear token con permisos `Object Read & Write`
4. Copiar:
   - `Account ID` → `R2_ACCOUNT_ID`
   - `Access Key ID` → `R2_ACCESS_KEY_ID`
   - `Secret Access Key` → `R2_SECRET_ACCESS_KEY`
5. En el bucket → **Settings** → activar **Public Access** para thumbnails (opcional)
6. Copiar la URL pública → `R2_PUBLIC_URL`

**CORS para R2** (en el bucket → Settings → CORS):
```json
[
  {
    "AllowedOrigins": ["https://lccourses.com", "http://localhost:3000"],
    "AllowedMethods": ["GET", "PUT", "POST"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## 2. Mercado Pago

1. Ir a [mercadopago.com.ar/developers](https://www.mercadopago.com.ar/developers)
2. Crear aplicación → obtener:
   - `Access Token` (producción) → `MP_ACCESS_TOKEN`
   - `Public Key` (producción) → `MP_PUBLIC_KEY` y `NEXT_PUBLIC_MP_PUBLIC_KEY`
3. En tu aplicación MP → **Webhooks**:
   - URL: `https://api.lccourses.com/api/webhooks/mercadopago`
   - Eventos: `payment`
4. Verificar con el simulador de pagos en modo test primero

---

## 3. Google OAuth

1. [console.cloud.google.com](https://console.cloud.google.com) → Credenciales
2. Crear **OAuth 2.0 Client ID** (tipo: Web application)
3. Orígenes autorizados:
   - `https://lccourses.com`
   - `http://localhost:3000`
4. Copiar `Client ID` → `GOOGLE_CLIENT_ID` y `NEXT_PUBLIC_GOOGLE_CLIENT_ID`

---

## 4. Gmail SMTP (Nodemailer)

1. Activar **verificación en 2 pasos** en la cuenta de Gmail
2. Ir a **Contraseñas de aplicación** → generar para "Correo"
3. Usar esa contraseña de 16 dígitos en `EMAIL_PASS`

---

## 5. Railway (Backend + PostgreSQL) — Recomendado

```bash
# Instalar CLI
npm install -g @railway/cli
railway login

# Desde la carpeta /backend
cd backend
railway init        # crear proyecto
railway up          # primer deploy

# Agregar PostgreSQL
railway add postgresql
# Railway conecta DATABASE_URL automáticamente

# Correr migraciones
railway run npm run migrate
```

### Variables de entorno en Railway Dashboard:
```
NODE_ENV=production
PORT=4000
FRONTEND_URL=https://lccourses.com
BACKEND_URL=https://api.lccourses.com
JWT_SECRET=<generar con: openssl rand -hex 64>
JWT_REFRESH_SECRET=<generar con: openssl rand -hex 64>
MP_ACCESS_TOKEN=APP_USR-...
MP_PUBLIC_KEY=APP_USR-...
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=lc-courses-videos
R2_PUBLIC_URL=https://pub-xxx.r2.dev
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=lccourses2026@gmail.com
EMAIL_PASS=<app password>
EMAIL_FROM=LC-COURSES <lccourses2026@gmail.com>
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
```

### Dominio personalizado en Railway:
- Dashboard → Settings → Domains → `api.lccourses.com`
- Agregar registro CNAME en tu DNS apuntando a Railway

---

## 6. Render (alternativa gratuita a Railway)

```bash
# Instalar CLI
npm install -g @render/cli

# O usar el Dashboard en render.com
# Crear nuevo Web Service → conectar repo GitHub → /backend
# Render detecta render.yaml automáticamente
```

El `render.yaml` ya está configurado en `/backend/render.yaml`.

---

## 7. Vercel (Frontend)

```bash
# Instalar CLI
npm install -g vercel
cd frontend
vercel login
vercel         # seguir el asistente
```

### Variables de entorno en Vercel Dashboard:
```
NEXT_PUBLIC_API_URL=https://api.lccourses.com/api
NEXT_PUBLIC_MP_PUBLIC_KEY=APP_USR-...
NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
NEXT_PUBLIC_SITE_URL=https://lccourses.com
```

### Dominio personalizado:
- Vercel Dashboard → Settings → Domains → agregar `lccourses.com`
- Configurar DNS del dominio apuntando a Vercel

---

## 8. Primer despliegue (orden correcto)

```bash
# 1. Configurar R2, Mercado Pago y Google OAuth (consolas web)

# 2. Deploy backend en Railway
cd backend
railway up
railway run npm run migrate   # crear tablas
railway run npm run seed      # datos de prueba (opcional)

# 3. Deploy frontend en Vercel
cd ../frontend
vercel --prod

# 4. Configurar dominio personalizado en ambas plataformas

# 5. Actualizar FRONTEND_URL en Railway con el dominio real
# 6. Probar flujo completo con tarjeta de prueba de Mercado Pago
```

---

## 9. Tarjetas de prueba Mercado Pago (TEST)

| Tipo | Número | CVV | Vence |
|------|--------|-----|-------|
| Mastercard (aprobada) | 5031 7557 3453 0604 | 123 | 11/25 |
| Visa (rechazada) | 4170 0688 1010 8020 | 123 | 11/25 |
| Mastercard (pendiente) | 5031 7557 3453 0604 | 123 | 11/25 |

Usar nombre: `APRO` para pago aprobado, `OTHE` para rechazado.

---

## 10. Monitoreo y logs

- **Railway**: `railway logs` o dashboard web
- **Render**: dashboard → logs en tiempo real
- **Vercel**: dashboard → Functions → logs
- **Errores de DB**: Railway dashboard → PostgreSQL → Query tab

---

## Estructura final del proyecto

```
lc-courses/
├── backend/                    ← Node.js API
│   ├── src/
│   │   ├── index.js            ← Entry point
│   │   ├── config/database.js  ← Pool PostgreSQL
│   │   ├── middleware/auth.js  ← JWT middleware
│   │   ├── routes/
│   │   │   ├── auth.js         ← Login, registro, Google
│   │   │   ├── courses.js      ← CRUD cursos
│   │   │   ├── payments.js     ← Preferencias MP
│   │   │   ├── webhooks.js     ← IPN Mercado Pago
│   │   │   ├── enrollments.js  ← Inscripciones + progreso
│   │   │   ├── certificates.js ← Certificados PDF
│   │   │   ├── uploads.js      ← URLs firmadas R2
│   │   │   └── admin.js        ← Panel admin
│   │   ├── services/
│   │   │   ├── r2.js           ← Cloudflare R2 SDK
│   │   │   ├── certificate.js  ← Generador PDF + QR
│   │   │   └── email.js        ← Nodemailer templates
│   │   └── migrations/
│   │       ├── schema.sql      ← Todas las tablas
│   │       └── run.js          ← Ejecuta migraciones
│   ├── Dockerfile
│   ├── railway.json
│   ├── render.yaml
│   └── .env.example
│
└── frontend/                   ← Next.js App
    ├── src/
    │   ├── app/                ← App Router Next.js
    │   │   ├── layout.jsx      ← Root layout
    │   │   ├── globals.css     ← Estilos globales
    │   │   ├── checkout/       ← Página de pago
    │   │   └── pago/exitoso/   ← Confirmación
    │   ├── lib/api.js          ← Cliente Axios + interceptors
    │   └── store/index.js      ← Zustand (auth + carrito)
    ├── vercel.json
    └── .env.example
```

---

## Costos estimados (Argentina)

| Servicio | Plan | Costo |
|---------|------|-------|
| Vercel | Hobby | **Gratis** |
| Railway | Starter | ~$5 USD/mes |
| Render | Free | **Gratis** (con limitaciones) |
| Cloudflare R2 | Free tier 10GB | **Gratis** hasta escalar |
| Gmail SMTP | - | **Gratis** |
| Mercado Pago | - | Comisión por venta (~3.49%) |

**Total mínimo para empezar: $0 — $5 USD/mes**
