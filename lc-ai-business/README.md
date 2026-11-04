# LC-AI BUSINESS
Plataforma SaaS multi-tenant de agentes de IA para empresas y PyMEs — **LC-SYSTEM · Soluciones que transforman**.

- Arquitectura y plan: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md)
- Despliegue en subdominio: [`DEPLOY.md`](DEPLOY.md)
- Integración con el ecosistema LC (API v1, webhooks, conectores): [`docs/API-ECOSISTEMA.md`](docs/API-ECOSISTEMA.md)

## Desarrollo local
```bash
cd backend && npm install
# PostgreSQL local con un rol sin superusuario:
#   createuser lc_ai -P   &&   createdb -O lc_ai lc_ai_business
cp .env.example .env      # ajustar DATABASE_URL
npm run seed              # planes, empresa demo, plantillas del marketplace y SUPER ADMIN
npm run dev               # http://localhost:4000  (API + interfaz)
npm test                  # 43 pruebas de integración (usa la BD lc_ai_test)
```

## Estado: Fases 1 a 5 implementadas
| Fase | Contenido |
|---|---|
| 1 | Login, multi-tenant (RLS), usuarios y roles, dashboard, agentes (8 tipos), chat, proveedor de IA intercambiable, conocimiento (TXT, MD, CSV, PDF, DOCX, XLSX, texto, URL), conversaciones (tomar/devolver control), SUPER ADMIN, demo `/demo` |
| 2 | CRM y leads, productos y stock (importación CSV), tickets, presupuestos y pedidos, aprobación humana de acciones de IA, automatizaciones (SI → ENTONCES), notificaciones, analytics completo con rango personalizado |
| 3 | Widget web embebible, WhatsApp Business Cloud API (webhook firmado, plantillas, ventana de 24 h), API keys + API pública v1 (OpenAPI), webhooks salientes firmados, conectores REST |
| 4 | Límites por plan (usuarios, agentes, documentos, almacenamiento, conversaciones y tokens mensuales), facturación (Mercado Pago + pago manual), marketplace con 9 plantillas de rubro |
| 6 | Búsqueda semántica híbrida (palabras + embeddings, pgvector opcional), reindexado y consumo de embeddings contado en el plan |
| 7 | Roles personalizados por empresa (permisos delegables, efecto inmediato) |
| 5 | Contrato para LC-SYSTEM BUSINESS / LC-ECOMMERCE / LC-PEDIDOS / LC-PREVIEWS: API v1, webhooks y conector REST con mapeo de campos |
