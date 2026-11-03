'use strict';
const env = require('../../config/env');
const { postJson } = require('./http');
const name = 'openai';

function toApi(system, messages) {
  const out = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'tool') out.push({ role: 'tool', tool_call_id: m.toolCallId, content: String(m.content) });
    else if (m.role === 'assistant' && m.toolCalls?.length) {
      out.push({
        role: 'assistant', content: m.content || null,
        tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.input) } })),
      });
    } else out.push({ role: m.role, content: m.content });
  }
  return out;
}

async function generate({ system, messages, tools = [], maxTokens = 700, temperature = 0.3, model }) {
  const body = { model: model || env.ai.openai.model, max_tokens: maxTokens, temperature, messages: toApi(system, messages) };
  if (tools.length) body.tools = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
  const data = await postJson('https://api.openai.com/v1/chat/completions', { authorization: `Bearer ${env.ai.openai.key}` }, body);
  const msg = data.choices?.[0]?.message || {};
  return {
    text: (msg.content || '').trim(),
    toolCalls: (msg.tool_calls || []).map((c) => {
      let input = {};
      try { input = JSON.parse(c.function.arguments || '{}'); } catch { /* argumentos corruptos: se validan después */ }
      return { id: c.id, name: c.function.name, input };
    }),
    usage: { input: data.usage?.prompt_tokens || 0, output: data.usage?.completion_tokens || 0 },
  };
}
module.exports = { name, generate, toApi, isConfigured: () => !!env.ai.openai.key, defaultModel: () => env.ai.openai.model };
