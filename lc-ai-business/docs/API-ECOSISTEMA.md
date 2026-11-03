# Integración con el ecosistema LC-SYSTEM

LC-AI BUSINESS habla con LC-SYSTEM BUSINESS, LC-ECOMMERCE, LC-PEDIDOS, LC-PREVIEWS y sistemas externos por tres vías. Todas aíslan los datos por empresa.

| Vía | Dirección | Cuándo usarla |
|---|---|---|
| **API v1** (`/api/v1`, API key con scopes) | otro sistema → LC-AI | Empujar productos, stock y clientes; leer pedidos y conversaciones |
| **Webhooks firmados** | LC-AI → otro sistema | Avisar leads, pedidos, presupuestos, stock bajo, derivaciones |
| **Conector REST** (en *Integraciones*) | LC-AI → otro sistema (pull) | Traer productos y stock de una API existente con mapeo de campos |

Contrato máquina-legible: `GET /api/v1/openapi.json` (público).

## 1. API key
*Integraciones → API keys → Crear*. Elegí solo los scopes necesarios (`products:read`, `products:write`, `stock:read`, `customers:read`, `customers:write`, `orders:read`, `orders:write`, `conversations:read`). El secreto `lcb_sk_…` se muestra una sola vez; se guarda únicamente su hash. Se revoca desde la misma pantalla.

```bash
curl -X POST https://TU-SUBDOMINIO/api/v1/products/sync \
  -H "Authorization: Bearer lcb_sk_..." -H "Content-Type: application/json" \
  -d '{"products":[{"sku":"TAL-650","name":"Taladro 650W","price":89900,"stock":12,"stock_min":3}]}'
```
Reglas: se unifica por `sku`; los campos ausentes no se pisan; precios con punto decimal (`12500.50`) o coma (`"12.500,50"`).

## 2. Webhooks salientes
*Integraciones → Webhooks*. Eventos: `conversation.handoff`, `lead.created`, `quote.requested`, `order.created`, `stock.low`, `customer.created`.

```
POST <tu-url>
X-LC-Event: stock.low
X-LC-Timestamp: 1767225600
X-LC-Signature: sha256=<HMAC_SHA256(secret, "<timestamp>.<body>")>
{"id":"…","event":"stock.low","created_at":"…","data":{"productId":"…"}}
```
Verificá la firma con el secreto `whsec_…` (se muestra una vez) y rechazá timestamps con más de 5 minutos. Solo se permiten destinos http(s) públicos (protección SSRF); en producción, https.

## 3. Conector REST (pull)
Configurás URL base, ruta de productos, autenticación (Bearer o cabecera propia), `items_path` (dónde está la lista en el JSON), paginación opcional (`?page=N`) y el **mapeo de campos** (`sku`, `name`, `price`, `stock`, `stock_min`, `brand`, `category`, `supplier`, `description`, `code`). Se sincroniza a demanda o cada 30 minutos (*auto_sync*). Los presets `LC-SYSTEM BUSINESS`, `LC-ECOMMERCE`, `LC-PEDIDOS` y `LC-PREVIEWS` solo precargan una ruta sugerida: ajustá el mapeo a la API real de cada producto.

## Estado de cada integración
| Integración | Estado |
|---|---|
| Widget web, WhatsApp Business (API oficial), API v1, webhooks, conector REST, Mercado Pago (suscripciones de LC-AI) | ✅ implementadas |
| LC-SYSTEM BUSINESS / LC-ECOMMERCE / LC-PEDIDOS / LC-PREVIEWS | ✅ vía API v1 + webhooks + conector REST. **No se conocía su API real:** hace falta definir el mapeo con cada equipo |
| Google, Instagram, Facebook Messenger, Email, Mercado Pago del comercio | ⏳ catalogadas, no implementadas |
