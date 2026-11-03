'use strict';
// Proveedor offline y determinista: demos, desarrollo y tests. NO es un modelo de lenguaje.
const name = 'mock';
const HUMAN_RE = /\b(humano|persona|asesor|operador|vendedor|alguien real|hablar con)\b/i;
const GREET_RE = /^\s*(hola|buenas|buen d[ií]a|buenas tardes|buenas noches|hey)\b/i;

async function generate({ messages, tools = [], context = {} }) {
  const last = messages[messages.length - 1] || { role: 'user', content: '' };
  const hasHandoff = tools.some((t) => t.name === 'handoff_to_human');
  const usage = { input: Math.ceil(JSON.stringify(messages).length / 4), output: 60 };

  if (last.role === 'tool') {
    return { text: 'Listo, te derivo con una persona del equipo que va a continuar la atención en breve.', toolCalls: [], usage };
  }
  const text = last.content || '';
  if (hasHandoff && HUMAN_RE.test(text)) {
    return { text: '', toolCalls: [{ id: 'mock-1', name: 'handoff_to_human', input: { reason: 'El cliente pidió hablar con una persona' } }], usage };
  }
  const k = (context.knowledge || [])[0];
  if (k) {
    const snippet = k.content.length > 420 ? `${k.content.slice(0, 420)}…` : k.content;
    return { text: `Según la información que tengo (${k.title}):\n\n${snippet}\n\n¿Querés que te ayude con algo más?`, toolCalls: [], usage };
  }
  if (GREET_RE.test(text)) {
    return { text: `¡Hola! Soy ${context.agentName || 'tu asistente'}. ¿En qué puedo ayudarte?`, toolCalls: [], usage };
  }
  return { text: 'No tengo esa información confirmada, así que prefiero no inventarla. ¿Querés que te derive con una persona del equipo?', toolCalls: [], usage };
}

module.exports = { name, generate, isConfigured: () => true, defaultModel: () => 'mock-1' };
