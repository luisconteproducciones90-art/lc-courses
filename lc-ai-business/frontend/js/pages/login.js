import { h, field, logo } from '../dom.js';
import { post } from '../api.js';
import { state, navigate } from '../main.js';

export default function page({ path }) {
  const reg = path === '/register';
  const err = h('div', { class: 'alert err', hidden: true });
  const f = {
    companyName: h('input', { required: true, maxlength: 120, autocomplete: 'organization' }),
    name: h('input', { required: true, maxlength: 120, autocomplete: 'name' }),
    email: h('input', { type: 'email', required: true, autocomplete: 'email' }),
    password: h('input', { type: 'password', required: true, minlength: reg ? 10 : 1, autocomplete: reg ? 'new-password' : 'current-password' }),
  };
  const btn = h('button', { class: 'btn primary', style: { width: '100%' }, type: 'submit' }, reg ? 'Crear cuenta' : 'Ingresar');
  const form = h('form', {
    novalidate: false,
    onsubmit: async (e) => {
      e.preventDefault(); err.hidden = true; btn.disabled = true;
      try {
        const body = reg ? { companyName: f.companyName.value, name: f.name.value, email: f.email.value, password: f.password.value } : { email: f.email.value, password: f.password.value };
        const me = await post(reg ? '/api/auth/register' : '/api/auth/login', body);
        Object.assign(state, { user: me.user, company: me.company, perms: me.permissions });
        navigate(me.user.role === 'super_admin' ? '/admin' : '/dashboard', true);
      } catch (x) {
        err.textContent = x.details?.length ? `${x.message}: ${x.details.map((d) => d.message).join(', ')}` : x.message; err.hidden = false;
      } finally { btn.disabled = false; }
    },
  },
  reg ? [field('Nombre de la empresa', f.companyName), field('Tu nombre', f.name)] : null,
  field('Email', f.email), field('Contraseña', f.password, reg ? 'Mínimo 10 caracteres, con letras y números.' : null), err, btn);

  return h('div', { class: 'auth' },
    h('section', { class: 'auth-hero' },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } }, logo(48), h('div', null, h('b', { style: { fontSize: '18px', letterSpacing: '.05em' } }, 'LC-AI BUSINESS'), h('div', { class: 'by' }, 'by LC-SYSTEM · Soluciones que transforman'))),
      h('h1', null, 'La IA que trabaja ', h('span', { class: 'grad-text' }, 'para tu empresa.')),
      h('p', { class: 'mute', style: { fontSize: '17px', maxWidth: '520px' } }, 'Agentes de atención, ventas y stock entrenados con tus propios documentos. Cada empresa en su espacio privado y aislado.'),
      h('ul', null, h('li', null, 'Agentes especializados con personalidad y reglas propias'), h('li', null, 'Base de conocimiento con tus PDFs, listas y políticas'), h('li', null, 'Derivación a una persona cuando hace falta'), h('li', null, 'Datos separados por empresa (multi-tenant)')),
      h('div', null, h('a', { class: 'btn', href: '/demo' }, '▶ Probá la demo sin registrarte'))),
    h('section', { class: 'auth-form' }, h('div', { class: 'card' },
      h('h1', { style: { marginBottom: '6px' } }, reg ? 'Creá tu cuenta' : 'Ingresá'),
      h('p', { class: 'mute', style: { marginBottom: '20px' } }, reg ? 'Empezá con el plan START. Sin tarjeta.' : 'Accedé a tu panel de LC-AI BUSINESS.'),
      form,
      h('p', { class: 'small mute', style: { marginTop: '16px', textAlign: 'center' } }, reg ? '¿Ya tenés cuenta? ' : '¿Todavía no tenés cuenta? ', h('a', { href: reg ? '/login' : '/register' }, reg ? 'Ingresar' : 'Registrate')))));
}
