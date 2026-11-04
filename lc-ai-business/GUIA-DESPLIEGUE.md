# Guía de despliegue paso a paso — LC-AI BUSINESS

Esta guía te lleva de "tengo el zip" a "la demo funciona en `https://ai.TU-DOMINIO`". Está pensada para hacerse sin conocimientos de servidores. Tiempo estimado: 60 a 90 minutos (la mayor parte es esperar el DNS y la primera compilación).

> Reemplazá **`ai.TU-DOMINIO`** por el subdominio real que elijas dentro de tu dominio de demos (por ejemplo `ai.demoslcsystem.com`).

**Qué se verificó antes de entregarte esto:** el zip se descomprimió en una carpeta vacía, se instalaron las dependencias, se arrancó en modo producción contra una base nueva y se comprobó el inicio de sesión, la demo y el marketplace. Lo que **no** se pudo probar desde acá: la compilación real en Render, el dominio y el HTTPS de tu cuenta, WhatsApp/Instagram/Messenger/Mercado Pago con cuentas reales y los modelos de IA reales. Esos pasos están marcados con 🔶 y tienen su verificación.

---

## Etapa 0 · Lo que necesitás tener a mano

| Qué | Para qué |
|---|---|
| Cuenta en **GitHub** (gratis) | Guardar el código; Render lo lee de ahí |
| Cuenta en **Render** (render.com) | Ejecutar la aplicación y la base de datos |
| Acceso al **DNS** de tu dominio | Crear el subdominio `ai` |
| **Git** instalado en tu computadora | Subir el código (`git --version` para comprobarlo) |
| Una contraseña larga para el SUPER ADMIN | La vas a poner en el paso 3 |

Render te va a pedir elegir un **plan** para el servicio y para la base de datos. El plan gratuito pone a dormir el servicio y no sirve para mostrárselo a clientes; elegí uno de pago, con respaldos de la base. Revisá los precios vigentes en Render, porque cambian.

---

## Etapa 1 · Subir el código a tu propio repositorio de GitHub

1. En GitHub: **New repository** → nombre `lc-ai-business` → **Private** → *no* marques "Add README" → **Create**.
2. Descomprimí el zip. Abrí una terminal **dentro de la carpeta descomprimida** (la que contiene `render.yaml`, `Dockerfile` y las carpetas `backend` y `frontend`).
3. Ejecutá, cambiando `TU-USUARIO`:

```bash
git init
git add .
git commit -m "LC-AI BUSINESS"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/lc-ai-business.git
git push -u origin main
```

**Qué deberías ver:** al recargar la página del repo, aparecen `render.yaml`, `Dockerfile`, `backend/`, `frontend/`, `docs/` y esta guía. No debe aparecer ningún archivo `.env`.

> No uses "Upload files" desde la web de GitHub: tiene un tope de 100 archivos por carga y el proyecto tiene más.

---

## Etapa 2 · Decidir los datos que vas a cargar

Vas a necesitar estos valores en el próximo paso. Anotalos en un lugar seguro (gestor de contraseñas).

| Dato | Ejemplo | Notas |
|---|---|---|
| `PUBLIC_URL` | `https://ai.TU-DOMINIO` | Sin barra al final. Es la dirección final. |
| `SUPERADMIN_EMAIL` | `admin@tu-empresa.com` | Será tu usuario de administración global |
| `SUPERADMIN_PASSWORD` | una frase larga con letras y números | Mínimo 10 caracteres. No la reutilices |

`JWT_SECRET` y `ENCRYPTION_KEY` **se generan solas** en Render. Más adelante vas a copiar `ENCRYPTION_KEY` a un lugar seguro: si se pierde, los tokens de WhatsApp y los secretos de integraciones ya guardados no se pueden descifrar.

---

## Etapa 3 · Crear el servicio y la base en Render 🔶

1. En Render: **New +** → **Blueprint**.
2. Conectá tu cuenta de GitHub si no lo hiciste y elegí el repo `lc-ai-business`.
3. Render lee `render.yaml` y te muestra lo que va a crear: un servicio web (`lc-ai-business`) y una base PostgreSQL (`lc-ai-db`).
4. Completá los valores que te pide:
   - `PUBLIC_URL` → el de la etapa 2. Si todavía no configuraste el dominio, poné provisoriamente la dirección `https://lc-ai-business-xxxx.onrender.com` que Render te muestre; la cambiás en la etapa 5.
   - `SUPERADMIN_EMAIL` y `SUPERADMIN_PASSWORD` → los de la etapa 2.
   - `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` → **dejalos vacíos** por ahora.
5. Elegí el plan del servicio y de la base (ver etapa 0) y tocá **Apply**.
6. Esperá la primera compilación (5 a 10 minutos). Seguila en **Logs**.

**Qué deberías ver al final de los logs:**

```
migración aplicada ... 008_social_email.sql
SUPER ADMIN creado: admin@tu-empresa.com
seed inicial aplicado
LC-AI BUSINESS escuchando
```

Y arriba, en la página del servicio, el estado **Live**. El seed inicial (planes, empresa de demostración, 9 plantillas del marketplace y tu SUPER ADMIN) se aplica solo en el primer arranque y es seguro repetirlo: no duplica nada ni cambia tu contraseña.

---

## Etapa 4 · Probarlo con la dirección de Render

Abrí la dirección que Render muestra arriba del servicio (`https://lc-ai-business-xxxx.onrender.com`):

| Probá | Resultado esperado |
|---|---|
| `/health` | `{"ok":true,"service":"lc-ai-business"}` |
| `/demo` | La pantalla "Probá LC-AI BUSINESS" con 4 agentes; escribí "¿Tenés taladro Bosch?" y responde |
| `/login` con tu SUPER ADMIN | Entra al panel de administración |

Si alguno falla, mirá la tabla de problemas al final.

---

## Etapa 5 · Conectar el subdominio `ai.TU-DOMINIO` 🔶

1. En Render, dentro del servicio: **Settings** → **Custom Domains** → **Add Custom Domain** → escribí `ai.TU-DOMINIO`.
2. Render te muestra el destino al que debe apuntar (algo como `lc-ai-business-xxxx.onrender.com`).
3. En el panel de DNS de tu dominio, creá este registro:

| Tipo | Nombre / Host | Valor / Destino |
|---|---|---|
| **CNAME** | `ai` | el destino que te mostró Render |

4. Volvé a Render y tocá **Verify**. La propagación del DNS puede tardar desde minutos hasta unas horas. Cuando termine, Render emite el certificado **HTTPS** solo.
5. Entonces, en **Environment**, corregí `PUBLIC_URL` a `https://ai.TU-DOMINIO` y guardá (Render vuelve a desplegar solo).

**Qué deberías ver:** `https://ai.TU-DOMINIO/demo` abre con candado. `PUBLIC_URL` importa porque de ahí salen las direcciones que se muestran en *Integraciones* (código del widget, URLs de los webhooks).

---

## Etapa 6 · Verificación automática

Desde una terminal, dentro de la carpeta del proyecto:

```bash
./scripts/smoke.sh https://ai.TU-DOMINIO
```

Debe terminar con `Resultado: 10 correctas, 0 con problemas`. Cada línea marcada con ✘ indica qué revisar (ver la tabla).

---

## Etapa 7 · Primer recorrido como administrador

1. Entrá a `https://ai.TU-DOMINIO/login` con tu SUPER ADMIN.
2. **Planes**: los cuatro planes (START, BUSINESS, PROFESSIONAL, ENTERPRISE) vienen **sin precio** a propósito. Cargá los precios cuando los definas; mientras tanto el cambio de plan se pide a LC-SYSTEM y se registra el pago a mano en *Facturas*.
3. Creá una empresa de prueba (*Empresas → Crear empresa*) o registrate en `/register` desde otra ventana.
4. Con esa empresa: instalá un agente desde *Marketplace*, subí un documento en *Conocimiento* y probalo en el agente.
5. En *Integraciones*, copiá el código del widget y probalo en `https://ai.TU-DOMINIO/widget-demo.html?company=lcb_…` (la clave está en la misma pantalla).

---

## Etapa 8 · Activar una IA real 🔶

Hasta ahora responde el **modo simulado** (sirve para mostrar el aspecto, pero no es un modelo de lenguaje). Para una demo seria:

1. En Render → **Environment**, cargá `ANTHROPIC_API_KEY` (o `OPENAI_API_KEY`). La clave vive solo en el servidor.
2. Entrá como SUPER ADMIN → **Proveedor de IA** → elegí el proveedor → **Guardar**.
3. Probá un agente en el chat de prueba: ahora debe responder con redacción propia, usando tus documentos.
4. **Fijá un límite de gasto en el panel del proveedor.** La demo pública consume tokens de tu cuenta.
5. Opcional: cargá los precios por modelo (misma pantalla) para ver el gasto estimado y poner un presupuesto mensual por plan.
6. Opcional: con `OPENAI_API_KEY` activás la búsqueda semántica (entiende sinónimos). Cada empresa usa *Conocimiento → Actualizar índice* una vez.

Las pruebas de esta parte están hechas con un modelo simulado: la calidad real de las respuestas la vas a ver recién acá.

---

## Etapa 9 · Canales y cobros (cuando los necesites) 🔶

Cada canal se conecta desde **Integraciones**; la pantalla te muestra la URL del webhook y el token de verificación que hay que pegar en el proveedor.

| Canal | Qué necesitás |
|---|---|
| **WhatsApp** | Cuenta de Meta for Developers con WhatsApp Business: Phone number ID, token permanente y app secret. Webhook: campo `messages`. |
| **Instagram / Messenger** | App de Meta con los permisos de mensajería. Para producción, Meta exige revisar y aprobar la app. |
| **Email** | Datos SMTP de la casilla de envío + un proveedor de correo entrante (por ejemplo Postmark → *Inbound webhook* con la URL `https://lc:SECRETO@ai.TU-DOMINIO/api/webhooks/email/CLAVE`). No hay IMAP. |
| **Mercado Pago** | `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` en Render, y la notificación `https://ai.TU-DOMINIO/api/webhooks/mercadopago` (tema *subscription_preapproval*). Requiere que los planes tengan precio. |

Conviene probar cada canal primero con credenciales de **prueba/sandbox**.

---

## Etapa 10 · Antes de mostrárselo a clientes

- [ ] `ENCRYPTION_KEY` copiada a un lugar seguro (Render → Environment).
- [ ] Respaldos automáticos de la base activados (plan de pago de la base).
- [ ] Contraseña del SUPER ADMIN larga y única. **No hay verificación en dos pasos todavía**: protegé esa cuenta y el correo asociado.
- [ ] Clave de IA real cargada y límite de gasto fijado en el proveedor.
- [ ] `./scripts/smoke.sh` sin errores.
- [ ] Recorrido completo: registro → agente → documento → chat → derivación a una persona → bandeja.
- [ ] Revisaste las limitaciones conocidas en `docs/ARQUITECTURA.md` (sección 7.1).

---

## Si algo no funciona

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| La compilación falla | Falta el `Dockerfile` en la raíz del repo | Revisá que `render.yaml` y `Dockerfile` estén en la raíz del repo, no dentro de una subcarpeta |
| El servicio se reinicia en bucle; logs con `JWT_SECRET` o `ENCRYPTION_KEY` | Variable ausente | Render → Environment: deben existir y tener 32+ caracteres (se generan solas con el Blueprint) |
| Logs con `SUPERADMIN_PASSWORD es obligatorio` | No se cargó la contraseña | Cargala en Environment y guardá |
| Logs con `es superusuario/BYPASSRLS` | Usás una base propia con un usuario administrador | Usá un usuario sin superusuario (ver DEPLOY.md, "Base de datos") |
| `/health` devuelve 503 | No conecta a la base | Verificá `DATABASE_URL` (la conecta el Blueprint) y `DATABASE_SSL=true` |
| `/demo` no muestra agentes | No corrió el seed | Confirmá `AUTO_SEED=true` y mirá en los logs "seed inicial aplicado" |
| El login dice "Origen no permitido" | Se accede por un host distinto al configurado y hay un proxy reescribiendo cabeceras | Acceder por la misma dirección del servicio; si usás un proxy propio, que conserve `Host` y `X-Forwarded-Proto` |
| El dominio no abre o da error de certificado | El DNS todavía no propagó | Esperá y volvé a tocar **Verify** en Render; comprobá que el CNAME apunte al destino exacto |
| El widget no aparece en un sitio | La clave pública es incorrecta o el sitio no está en la lista permitida | Revisá *Integraciones → Widget → Configurar* |
| WhatsApp/Meta responde 403 al webhook | App secret o token de verificación distintos | Volvé a copiar ambos desde *Integraciones* |
| Cambié `ENCRYPTION_KEY` y WhatsApp dejó de andar | Los secretos guardados no se pueden descifrar con otra clave | Restituí la clave original o volvé a cargar los tokens |

---

## Alternativa: servidor propio (VPS con Docker)

Si preferís un servidor propio: instalá Docker, copiá `.env.example` a `.env` y completalo, y ejecutá `docker compose up -d --build`. Poné Caddy o Nginx delante para el HTTPS. El detalle está en `DEPLOY.md`.

## Actualizar a una versión nueva

Subí los cambios al repo (`git push`): Render vuelve a compilar y a desplegar solo, y las migraciones de base de datos corren automáticamente al iniciar.
