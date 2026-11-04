#!/usr/bin/env bash
# Verificación rápida de un despliegue:  ./scripts/smoke.sh https://ai.tu-dominio.com
URL="${1%/}"; [ -z "$URL" ] && { echo "Uso: $0 https://tu-subdominio"; exit 2; }
ok=0; bad=0
check() { # nombre, condición (comando)
  if eval "$2" >/dev/null 2>&1; then echo "  ✔ $1"; ok=$((ok+1)); else echo "  ✘ $1"; bad=$((bad+1)); fi
}
echo "Probando $URL"
check "El servicio responde (/health)"                 "curl -fsS --max-time 20 '$URL/health' | grep -q '\"ok\":true'"
check "La base de datos conecta"                        "curl -fsS --max-time 20 '$URL/health' | grep -q lc-ai-business"
check "Se sirve la interfaz (/login)"                   "curl -fsS --max-time 20 '$URL/login' | grep -qi 'LC-AI BUSINESS'"
check "La demo pública tiene 4 agentes"                 "[ \"\$(curl -fsS --max-time 20 '$URL/api/demo/agents' | grep -o '\"type\"' | wc -l)\" = 4 ]"
check "HTTPS fuerza HSTS"                               "curl -fsSI --max-time 20 '$URL/login' | grep -qi strict-transport-security"
check "CSP estricta activa"                             "curl -fsSI --max-time 20 '$URL/login' | grep -qi \"content-security-policy: default-src 'self'\""
check "El widget se puede cargar desde otros sitios"    "curl -fsSI --max-time 20 '$URL/lc-ai-widget.js' | grep -qi 'cross-origin-resource-policy: cross-origin'"
check "Contrato de la API v1 público"                   "curl -fsS --max-time 20 '$URL/api/v1/openapi.json' | grep -q '\"openapi\"'"
check "Rutas privadas piden sesión"                     "[ \"\$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 '$URL/api/agents')\" = 401 ]"
case "$URL" in https://*) check "HTTP redirige a HTTPS" "[ \"\$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 'http://${URL#https://}/login')\" = 301 ]";; esac
echo; echo "Resultado: $ok correctas, $bad con problemas"; [ "$bad" = 0 ]
