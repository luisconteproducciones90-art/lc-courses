'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const db = require('./pool');
const { migrate } = require('./migrate');
const { chunkText, chunkCsv } = require('../ai/chunker');
const demoData = require('./demoData');
const templates = require('./templates');

// Sin precios definitivos: price_cents NULL, configurable desde SUPER ADMIN.
const PLANS = [
  { code: 'start', name: 'START', description: 'Para pequeños negocios.', sort: 1, limits: { users: 2, agents: 1, conversations: 500, documents: 10, storage_mb: 100, ai_tokens: 500000 }, features: { whatsapp: false, widget: true, api: false } },
  { code: 'business', name: 'BUSINESS', description: 'Para comercios.', sort: 2, limits: { users: 5, agents: 3, conversations: 2000, documents: 50, storage_mb: 500, ai_tokens: 2000000 }, features: { whatsapp: true, widget: true, api: false } },
  { code: 'professional', name: 'PROFESSIONAL', description: 'Para PyMEs.', sort: 3, limits: { users: 15, agents: 10, conversations: 10000, documents: 200, storage_mb: 2000, ai_tokens: 10000000 }, features: { whatsapp: true, widget: true, api: true } },
  { code: 'enterprise', name: 'ENTERPRISE', description: 'Para empresas con necesidades personalizadas.', sort: 4, limits: { users: -1, agents: -1, conversations: -1, documents: -1, storage_mb: -1, ai_tokens: -1 }, features: { whatsapp: true, widget: true, api: true, custom: true } },
];

async function seedPlans() {
  await db.system(async (q) => {
    for (const p of PLANS) {
      await q(`INSERT INTO plans (code, name, description, sort_order, limits, features) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (code) DO NOTHING`,
        [p.code, p.name, p.description, p.sort, JSON.stringify(p.limits), JSON.stringify(p.features)]);
    }
  });
}

async function seedTemplates() {
  await db.system(async (q) => {
    for (const t of templates) {
      await q('INSERT INTO agent_templates (slug, name, industry, description, icon, config, status) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (slug) DO NOTHING',
        [t.slug, t.name, t.industry, t.description, t.icon, JSON.stringify(t.config), t.status]);
    }
  });
}

async function seedSuperAdmin(email, password) {
  const [exists] = await db.system((q) => q('SELECT id FROM users WHERE lower(email) = lower($1)', [email]));
  if (exists) return false;
  await db.system(async (q) => q("INSERT INTO users (company_id, email, password_hash, name, role) VALUES (NULL,$1,$2,'Super Admin LC-SYSTEM','super_admin')", [email.toLowerCase(), await bcrypt.hash(password, 12)]));
  return true;
}

async function seedDemo() {
  const [ex] = await db.system((q) => q('SELECT id FROM companies WHERE is_demo'));
  if (ex) return ex.id;
  await db.system(async (q) => {
    const [plan] = await q("SELECT id FROM plans WHERE code = 'enterprise'");
    const [c] = await q(`INSERT INTO companies (name, legal_name, description, address, phone, whatsapp, email, website, business_hours, services, policies, faq, status, is_demo, plan_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active',true,$13) RETURNING id`,
    [demoData.company.name, demoData.company.legal, demoData.company.description, demoData.company.address, demoData.company.phone, demoData.company.whatsapp, demoData.company.email,
      demoData.company.website, demoData.company.hours, demoData.company.services, demoData.company.policies, demoData.company.faq, plan.id]);
    for (const d of demoData.docs) {
      const chunks = d.csv ? chunkCsv(d.content) : chunkText(d.content);
      const [doc] = await q("INSERT INTO documents (company_id, title, source_type, mime, size_bytes, status, chunk_count) VALUES ($1,$2,'text','text/plain',$3,'ready',$4) RETURNING id",
        [c.id, d.title, Buffer.byteLength(d.content), chunks.length]);
      for (let i = 0; i < chunks.length; i += 1) await q('INSERT INTO knowledge_chunks (company_id, document_id, ordinal, content) VALUES ($1,$2,$3,$4)', [c.id, doc.id, i, chunks[i]]);
    }
    for (const a of demoData.agents) {
      const [ag] = await q(`INSERT INTO agents (company_id, name, description, type, avatar, personality, tone, objective, instructions, welcome_message, rules, autonomy, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active') RETURNING id`,
      [c.id, a.name, a.description, a.type, a.avatar, a.personality, a.tone, a.objective, a.instructions || '', a.welcome, JSON.stringify(a.rules || []), a.autonomy || 'medium']);
      for (const t of a.tools) await q('INSERT INTO agent_tools (company_id, agent_id, tool_name) VALUES ($1,$2,$3)', [c.id, ag.id, t]);
    }
  });
}

async function seedAll({ superAdminEmail, superAdminPassword } = {}) {
  await migrate();
  await seedPlans();
  await seedDemo();
  await seedTemplates();
  const email = superAdminEmail || env.superAdmin.email;
  let password = superAdminPassword || env.superAdmin.password;
  if (email) {
    let generated = false;
    if (!password) {
      if (env.isProd) throw new Error('SUPERADMIN_PASSWORD es obligatorio en producción');
      password = `${crypto.randomBytes(9).toString('base64url')}a1`; generated = true;
    }
    const created = await seedSuperAdmin(email, password);
    if (created && generated) console.log(`\nSUPER ADMIN creado: ${email}\nContraseña temporal (guardala, no se vuelve a mostrar): ${password}\n`);
    else if (created) console.log(`SUPER ADMIN creado: ${email}`);
  } else console.log('Tip: definí SUPERADMIN_EMAIL y SUPERADMIN_PASSWORD para crear el SUPER ADMIN.');
}

module.exports = { seedAll, seedPlans, seedDemo, seedTemplates };
if (require.main === module) seedAll().then(() => db.close()).catch((e) => { console.error(e.message); process.exit(1); });
