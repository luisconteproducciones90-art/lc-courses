'use strict';
const env = require('../../config/env');
const { postJson } = require('./http');
const name = 'anthropic';

// Formato interno de mensajes: {role:'user'|'assistant'|'tool', content, toolCalls?, toolCallId?}
function toApi(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role === 'tool') {
      const block = { type: 'tool_result', tool_use_id: m.toolCallId, content: String(m.content) };
      const last = out[out.length - 1];
      if (last && last.role === 'user' && Array.isArray(last.content)) last.content.push(block);
      else out.push({ role: 'user', content: [block] });
    } else if (m.role === 'assistant' && m.toolCalls?.length) {
      const content = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const c of m.toolCalls) content.push({ type: 'tool_use', id: c.id, name: c.name, input: c.input });
      out.push({ role: 'assistant', content });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

async function generate({ system, messages, tools = [], maxTokens = 700, temperature = 0.3, model }) {
  const body = { model: model || env.ai.anthropic.model, max_tokens: maxTokens, temperature, system, messages: toApi(messages) };
  if (tools.length) body.tools = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
  const data = await postJson('https://api.anthropic.com/v1/messages', { 'x-api-key': env.ai.anthropic.key, 'anthropic-version': '2023-06-01' }, body);
  const blocks = data.content || [];
  return {
    text: blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim(),
    toolCalls: blocks.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, input: b.input || {} })),
    usage: { input: data.usage?.input_tokens || 0, output: data.usage?.output_tokens || 0 },
  };
}
module.exports = { name, generate, toApi, isConfigured: () => !!env.ai.anthropic.key, defaultModel: () => env.ai.anthropic.model };
