// Carga el widget con la clave de la query string (solo para la página de prueba; CSP no admite scripts inline).
const key = new URLSearchParams(location.search).get('company');
if (key) { const s = document.createElement('script'); s.src = '/lc-ai-widget.js'; s.dataset.company = key; s.async = true; document.body.append(s); }
