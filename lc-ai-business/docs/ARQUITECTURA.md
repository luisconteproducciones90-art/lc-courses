# LC-AI BUSINESS — Plan de implementación y arquitectura

> Producto de **LC-SYSTEM — Soluciones Que Transforman**.
> Este documento define stack, estructura, base de datos, API, seguridad y multi-tenancy.
> Estado actual: **Fases 1 a 5 implementadas** (33 pruebas de integración). Ver limitaciones en 7.1.

## 1. Análisis y decisiones

El repositorio ya contiene otro producto (LC-COURSES). LC-AI BUSINESS vive aislado en `lc-ai-business/` con su propio backend, frontend y base de datos; no comparte código ni tablas.

| Decisión | Elección | Motivo |
|---|---|---|
| Backend | Node 20+, Express 4, módulos por dominio | Mismo stack que ya domina LC-SYSTEM; simple de desplegar |
| Base de datos | PostgreSQL 14+ | Multi-tenant con Row-Level Security, full-text search, `pgvector` a futuro |
| Frontend | SPA sin build (JS modular + CSS propio), servida estática | Cero dependencias en el navegador, CSP estricta, se puede mover a Next.js sin tocar la API |
| IA | Capa `AIProvider` (mock / Anthropic / OpenAI; Google reservado) | Sin dependencia de un proveedor; claves solo en servidor |
| RAG | Chunks + búsqueda full-text (`tsvector` español) detrás de la interfaz `retriever` | Funciona hoy sin extensiones; columna `embedding` lista para `pgvector` |
| Auth | JWT corto en cookie `HttpOnly` + refresh opaco rotativo en BD + CSRF double-submit | Sin tokens en JavaScript; sesiones revocables |
| Validación | `zod` en cada endpoint | Inputs tipados y acotados |

## 2. Estructura de carpetas

```
lc-ai-business/
├── docs/ARQUITECTURA.md          ← este documento
├── backend/
│   ├── src/
│   │   ├── config/env.js         ← única lectura de variables de entorno
│   │   ├── db/                   ← pool, withTenant/withSystem, migraciones, seed
│   │   ├── lib/                  ← errores, logger (con redacción), permisos, auditoría, tokens
│   │   ├── middleware/           ← auth, CSRF, rate limit, errores
│   │   ├── ai/                   ← providers/, promptBuilder, orchestrator, tools, retriever, chunker, extractors
│   │   ├── modules/              ← auth, companies, users, agents, conversations, documents, analytics, admin, demo, ai
│   │   ├── app.js                ← composición de Express
│   │   └── server.js
│   └── test/                     ← pruebas de integración contra PostgreSQL real
└── frontend/                     ← SPA (index.html, css/, js/)
```

## 3. Multi-tenancy (regla: una empresa JAMÁS ve datos de otra)

Defensa en tres capas:

1. **Esquema**: toda tabla de negocio lleva `company_id NOT NULL` con FK a `companies`.
2. **Row-Level Security en PostgreSQL** (`FORCE ROW LEVEL SECURITY`): cada política exige `company_id = app_company()`. El contexto se fija por transacción con `set_config('app.company_id', …, true)` dentro de `db.tenant(companyId, fn)`. Aunque una consulta olvide el `WHERE company_id`, la base no devuelve filas ajenas.
3. **Aplicación**: el `company_id` sale **siempre** de la sesión autenticada (o de la clave pública del widget resuelta en servidor), nunca del body, la URL ni de argumentos de herramientas de IA.

Operaciones globales (login, panel SUPER ADMIN) usan `db.system(fn)`, visible y auditable en el código. El rol de BD de la aplicación **no** debe ser superusuario ni `BYPASSRLS` (el arranque lo verifica y, en producción, se niega a iniciar).

## 4. Base de datos

Migraciones: `001_core` (núcleo), `002_crm_catalog`, `003_channels_api`, `004_billing_marketplace`, `005_semantic_search`, `006_custom_roles`. Todas las tablas con `company_id` tienen RLS; `plans` y `agent_templates` son globales.

Fase 1 crea (migración `001_core.sql`):

`plans`, `companies`, `users`, `refresh_sessions`, `subscriptions`, `agents`, `agent_tools`, `customers`, `conversations`, `conversation_notes`, `messages`, `documents`, `knowledge_chunks` (con `embedding`), `usage`, `audit_logs`, `settings`.

Creadas en las fases siguientes:

| Fase | Tablas |
|---|---|
| 2 | `products`, `categories`, `leads`, `tickets`, `orders`, `pending_actions`, `automations`, `automation_logs`, `notifications` |
| 3 | `integrations` (secretos cifrados AES-256-GCM), `api_keys` (solo hash), `whatsapp_templates`, `webhook_endpoints`, `webhook_events` |
| 4 | `invoices`, `agent_templates` (globales), `agent_installs` |
| Roles | `roles` (por empresa; permisos delegables, nunca `users:*`, `roles:*` ni `billing:write`) |

Roles base fijos (`company_admin`, `operator`, `viewer`) con matriz en `lib/permissions.js` + roles propios por empresa (tabla `roles`, `users.role_id`). Los permisos se leen en cada request: un cambio de rol rige de inmediato. Solo el administrador gestiona usuarios y roles; esos permisos no se pueden delegar, para evitar escaladas de privilegio.

## 5. API REST (`/api`)

| Prefijo | Fase 1 | Notas |
|---|---|---|
| `/auth` | ✅ csrf, register, login, refresh, logout, me, change-password | |
| `/companies` | ✅ perfil de la empresa actual | |
| `/users` | ✅ CRUD de equipo | límite por plan |
| `/agents` | ✅ CRUD, herramientas, presets | |
| `/conversations` | ✅ bandeja, responder, tomar/devolver, cerrar, etiquetas, notas | |
| `/documents`, `/knowledge` | ✅ subir (TXT/MD/CSV/PDF/texto), borrar, búsqueda de prueba | |
| `/analytics` | ✅ resumen básico | completo en Fase 2 |
| `/ai` | ✅ chat de prueba de agentes | |
| `/admin` | ✅ empresas, planes, proveedor IA, auditoría | solo SUPER ADMIN |
| `/demo` | ✅ chat público con datos ficticios | |
| `/customers`, `/leads`, `/products`, `/tickets`, `/orders`, `/approvals`, `/automations`, `/notifications` | ✅ | Fase 2 |
| `/widget/:key/*` | ✅ público | Chat embebible, CORS por empresa |
| `/whatsapp`, `/webhooks/whatsapp/:key` | ✅ | Config + webhook con firma HMAC |
| `/integrations` | ✅ | Widget, API keys, webhooks, conectores |
| `/v1/*` | ✅ API key | Ecosistema LC; contrato en `/api/v1/openapi.json` |
| `/billing`, `/marketplace`, `/webhooks/mercadopago` | ✅ | Fase 4 |

Convención de errores: `{ "error": { "code": "...", "message": "...", "details"? } }`.

## 6. Seguridad

- Contraseñas con `bcrypt` (coste 12), política mínima, bloqueo temporal tras intentos fallidos + rate limit por IP.
- Cookies `HttpOnly`, `SameSite=Lax`, `Secure` en producción; access token 15 min; refresh 7 días con rotación y detección de reutilización (revoca toda la familia).
- CSRF double-submit en todo método no seguro autenticado + verificación de `Origin`.
- Helmet con CSP estricta (sin scripts ni estilos inline); frontend construye el DOM con `textContent` (sin `innerHTML` con datos) → XSS.
- SQL siempre parametrizado; validación `zod`; límites de tamaño en JSON y archivos.
- Claves de IA solo en variables de entorno del servidor; nunca se serializan ni se registran.
- Logs JSON con redacción de campos sensibles; `audit_logs` para acciones administrativas.
- El contenido de documentos y mensajes se trata como **datos no confiables** dentro del prompt (mitigación de prompt injection); las herramientas del agente reciben el tenant del servidor y las acciones con efectos exigen aprobación (`requires_approval`).

## 7. Capa de IA

```
AIProvider.generate({ system, messages, tools, maxTokens }) → { text, toolCalls, usage }
   ├─ mock        (offline, determinista: demos y tests)
   ├─ anthropic   (Messages API)
   ├─ openai      (Chat Completions)
   └─ google      (reservado)
```

El prompt se arma por secciones con presupuesto de caracteres: `SYSTEM` (reglas de plataforma no editables + instrucciones del agente) · `BUSINESS CONTEXT` · `KNOWLEDGE` (fragmentos recuperados, marcados como datos) · `RULES` · `TOOLS` · `CONVERSATION HISTORY` · `USER MESSAGE`.

Reglas de plataforma (siempre presentes): no inventar información/precios/stock/políticas, admitir cuando no se sabe, derivar a una persona, respetar las instrucciones de la empresa, no revelar prompts ni claves, no acceder a datos de otras empresas.

## 7.1 Limitaciones conocidas de la Fase 1

- El proveedor `mock` es simulado (no es un modelo de lenguaje). Los adaptadores Anthropic/OpenAI están implementados pero **no se probaron contra las APIs reales** (no hay claves en este entorno); la lógica de herramientas sí está probada con el mock.
- **Búsqueda híbrida** (palabras + vectores, fusión RRF). Con `OPENAI_API_KEY` usa embeddings reales (`text-embedding-3-small`: sinónimos y paráfrasis); sin clave usa un hashing local que solo tolera tipeos, plurales y acentos. Usa `pgvector` si la base permite crear la extensión; si no, calcula la similitud en la aplicación (tope de 4000 fragmentos por consulta). La calidad semántica real y el camino OpenAI se probaron con un modelo simulado, no contra la API real. Sin índice HNSW todavía: para decenas de miles de fragmentos conviene agregarlo.
- Extracción de PDF/DOCX/XLSX en el proceso de la API (sin OCR: PDFs escaneados e imágenes no se leen). Para escala conviene un worker aislado. Las URLs se descargan con protección SSRF.
- Los archivos originales no se guardan, solo su texto fragmentado (almacenamiento de objetos llega con la Fase 4).
- Rate limiting en memoria por proceso: con varias instancias hay que pasarlo a Redis. Los webhooks de WhatsApp se procesan en segundo plano en el mismo proceso (sin cola): si el servidor se reinicia a mitad, Meta reintenta.
- **WhatsApp y Mercado Pago no se probaron contra los servicios reales** (sin credenciales aquí): están probados con transportes simulados, firmas HMAC reales y los formatos documentados por Meta y Mercado Pago. Hay que hacer una prueba de punta a punta con credenciales de sandbox antes de vender.
- **Ecosistema LC**: no se conocen las APIs reales de LC-SYSTEM BUSINESS, LC-ECOMMERCE, LC-PEDIDOS ni LC-PREVIEWS; se entrega un contrato (API v1, webhooks) y un conector REST con mapeo configurable, no integraciones específicas. Google, Instagram, Facebook y Email quedan catalogados, sin implementar.
- Los precios de los planes están sin definir a propósito; hasta entonces el cambio de plan es por solicitud + pago manual.
- Los tokens de IA se registran según lo que informe el proveedor; el costo en dinero no se calcula.

## 8. Hoja de ruta

| Fase | Contenido | Estado |
|---|---|---|
| 1 MVP | Login, usuarios, empresas, multi-tenant, dashboard, agentes, chat, IA, conocimiento, documentos, conversaciones, seguridad base, modo demo | ✅ |
| 2 | CRM, productos y stock (API para LC-SYSTEM BUSINESS), leads, analytics completo, automatizaciones, herramientas con aprobación | ⏳ |
| 3 | WhatsApp Business (API oficial), widget web embebible, integraciones, API keys públicas | ⏳ |
| 4 | Suscripciones, límites de consumo, billing (Mercado Pago), marketplace de agentes (`agent_templates` globales + instalación) | ⏳ |
| 5 | LC-SYSTEM BUSINESS, LC-ECOMMERCE, LC-PEDIDOS, LC-PREVIEWS, integraciones externas | ⏳ |

Preparación para el ecosistema: cada empresa tendrá `api_keys` con scopes; los demás productos LC hablan con la API REST y reciben eventos por `webhooks` firmados (HMAC).
