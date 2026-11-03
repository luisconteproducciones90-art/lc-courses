'use strict';
// Proveedor offline y determinista: demos, desarrollo y tests. NO es un modelo de lenguaje.
// Entiende un puñado de intenciones por palabras clave para ejercitar las herramientas.
const name = 'mock';
const HUMAN_RE = /\b(humano|persona|asesor|operador|vendedor|alguien real|hablar con)\b/i;
const GREET_RE = /^\s*(hola|buenas|buen d[ií]a|buenas tardes|buenas noches|hey)\b/i;
const PRODUCT_RE = /(precio|cuesta|cu[aá]nto|stock|ten[eé]s|tienen|hay |disponible)/i;
const QUOTE_RE = /presupuesto\s+(?:de\s+)?(\d+)\s+([^.,?]+)/i;
const ORDER_RE = /(?:quiero comprar|hac[eé] (?:el )?pedido de|pedido de)\s+(\d+)\s+([^.,?]+)/i;
const LEAD_RE = /(?:mi nombre es|me llamo)\s+([\p{L} ]{2,40}?)(?:[.,]| y | mi |$)/iu;
const TICKET_RE = /(reclamo|ticket)/i;
const money = (n) => `$${Number(n).toLocaleString('es-AR')}`;
const usage = (messages) => ({ input: Math.ceil(JSON.stringify(messages).length / 4), output: 60 });

function fromTool(last, context, messages) {
  let r = {};
  try { r = JSON.parse(last.content); } catch { /* sin datos */ }
  const k = (context.knowledge || [])[0];
  let text;
  switch (last.name) {
    case 'handoff_to_human': text = 'Listo, te derivo con una persona del equipo que va a continuar la atención en breve.'; break;
    case 'query_products':
    case 'query_stock':
      if (r.found) text = `Esto es lo que encontré:\n${r.products.map((p) => `• ${p.name} (${p.sku || 's/sku'})${p.price !== undefined ? ` — ${money(p.price)}` : ''} — ${p.availability}${p.stock_units > 0 ? ` (${p.stock_units} u.)` : ''}`).join('\n')}`;
      else if (k) text = `Según la información que tengo (${k.title}):\n\n${k.content.slice(0, 420)}`;
      else text = 'No encontré ese producto en el catálogo, así que prefiero no inventar datos. ¿Querés que te derive con una persona del equipo?';
      break;
    case 'create_lead': text = r.error ? `No pude registrar tus datos: ${r.error}` : 'Listo, registré tus datos. Una persona del equipo te va a contactar.'; break;
    case 'create_ticket': text = r.error ? `No pude crear el ticket: ${r.error}` : 'Dejé registrado tu reclamo, el equipo lo va a revisar.'; break;
    case 'create_quote':
    case 'create_order':
      if (r.pending) text = 'Tu solicitud quedó pendiente de confirmación de una persona del equipo. Te avisamos apenas esté lista.';
      else if (r.error) text = `No pude completar la solicitud: ${r.error}`;
      else text = `Listo. Total: ${money(r.total)}.`;
      break;
    default: text = r.message || 'Listo.';
  }
  return { text, toolCalls: [], usage: usage(messages) };
}

async function generate({ messages, tools = [], context = {} }) {
  const last = messages[messages.length - 1] || { role: 'user', content: '' };
  const has = (n) => tools.some((t) => t.name === n);
  if (last.role === 'tool') return fromTool(last, context, messages);
  const text = last.content || '';
  const call = (n, input) => ({ text: '', toolCalls: [{ id: `mock-${n}`, name: n, input }], usage: usage(messages) });
  if (has('handoff_to_human') && HUMAN_RE.test(text)) return call('handoff_to_human', { reason: 'El cliente pidió hablar con una persona' });
  let m;
  if (has('create_order') && (m = ORDER_RE.exec(text))) return call('create_order', { items: [{ name: m[2].trim(), qty: Number(m[1]) }] });
  if (has('create_quote') && (m = QUOTE_RE.exec(text))) return call('create_quote', { items: [{ name: m[2].trim(), qty: Number(m[1]) }] });
  if (has('create_lead') && (m = LEAD_RE.exec(text))) {
    return call('create_lead', { name: m[1].trim(), phone: /(\+?\d[\d ]{6,})/.exec(text)?.[1]?.trim(), email: /([\w.+-]+@[\w-]+\.[\w.]+)/.exec(text)?.[1], interest: text.slice(0, 300) });
  }
  if (has('create_ticket') && TICKET_RE.test(text)) return call('create_ticket', { title: text.slice(0, 120), description: text, priority: 'normal' });
  if ((has('query_products') || has('query_stock')) && PRODUCT_RE.test(text)) return call(has('query_products') ? 'query_products' : 'query_stock', { query: text });
  const k = (context.knowledge || [])[0];
  if (k) {
    const snippet = k.content.length > 420 ? `${k.content.slice(0, 420)}…` : k.content;
    return { text: `Según la información que tengo (${k.title}):\n\n${snippet}\n\n¿Querés que te ayude con algo más?`, toolCalls: [], usage: usage(messages) };
  }
  if (GREET_RE.test(text)) return { text: `¡Hola! Soy ${context.agentName || 'tu asistente'}. ¿En qué puedo ayudarte?`, toolCalls: [], usage: usage(messages) };
  return { text: 'No tengo esa información confirmada, así que prefiero no inventarla. ¿Querés que te derive con una persona del equipo?', toolCalls: [], usage: usage(messages) };
}

module.exports = { name, generate, isConfigured: () => true, defaultModel: () => 'mock-1' };
