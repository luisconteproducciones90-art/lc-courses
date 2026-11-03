# LC-AI BUSINESS
Plataforma SaaS multi-tenant de agentes de IA para empresas y PyMEs — **LC-SYSTEM · Soluciones que transforman**.

- Plan y arquitectura: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md)
- Despliegue en subdominio: [`DEPLOY.md`](DEPLOY.md)

## Desarrollo local
```bash
cd backend && npm install
# PostgreSQL local con un rol sin superusuario:
#   createuser lc_ai -P   &&   createdb -O lc_ai lc_ai_business
cp .env.example .env      # ajustar DATABASE_URL
npm run seed              # planes, empresa demo y SUPER ADMIN (SUPERADMIN_EMAIL/PASSWORD)
npm run dev               # http://localhost:4000  (API + interfaz)
npm test                  # pruebas de integración (usa la BD lc_ai_test)
```

## Estado — Fase 1 (MVP) ✔
Login/registro · multi-tenant con RLS · usuarios y roles · empresa · dashboard · agentes (8 tipos) · chat de prueba · IA por proveedor intercambiable (mock/Anthropic/OpenAI) · base de conocimiento (TXT, MD, CSV, PDF, texto) con búsqueda · centro de conversaciones (tomar/devolver control, notas, etiquetas) · SUPER ADMIN (empresas, planes, proveedor IA, auditoría) · modo demo `/demo`.

Fases 2–5 (CRM, productos, automatizaciones, WhatsApp, widget, billing, integraciones LC) están diseñadas y sus rutas API reservadas (`501`).
