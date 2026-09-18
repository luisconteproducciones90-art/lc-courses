'use client';
import { useState } from 'react';
import { initMercadoPago, Wallet } from '@mercadopago/sdk-react';
import { useCartStore, useAuthStore } from '../../store';
import { paymentsAPI } from '../../lib/api';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

initMercadoPago(process.env.NEXT_PUBLIC_MP_PUBLIC_KEY, { locale: 'es-AR' });

export default function CheckoutPage() {
  const router = useRouter();
  const { items, total, subtotal, couponCode, discountPct, setCoupon, clearCart } = useCartStore();
  const { user, isAuthenticated } = useAuthStore();
  const [preferenceId, setPreferenceId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [method, setMethod] = useState('mp'); // mp | transfer

  const COUPONS = { 'BIENVENIDO20': 20, 'LCCOURSES10': 10 };

  const applyCoupon = () => {
    const code = couponInput.toUpperCase().trim();
    if (COUPONS[code]) {
      setCoupon(code, COUPONS[code]);
      toast.success(`Cupón aplicado: ${COUPONS[code]}% OFF`);
    } else {
      toast.error('Cupón inválido o expirado');
    }
  };

  const createPreference = async () => {
    if (!isAuthenticated()) { router.push('/auth'); return; }
    if (!items.length) { toast.error('Tu carrito está vacío'); return; }
    setLoading(true);
    try {
      const { data } = await paymentsAPI.createPreference(
        items.map(i => ({ course_id: i.id })),
        couponCode || undefined
      );
      setPreferenceId(data.preference_id);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al procesar pago');
    } finally {
      setLoading(false);
    }
  };

  const fmtARS = (n) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 });

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 relative z-10">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <span className="text-xs tracking-widest uppercase text-cyan-400">// Checkout</span>
          <h1 className="font-orbitron text-3xl font-bold mt-1"
              style={{ background: 'linear-gradient(135deg,#fff,#00d4ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Finalizar Compra
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* ITEMS */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-sm tracking-widest uppercase text-[#6a8aaa]">Tus cursos</h3>
            {items.map(course => (
              <div key={course.id}
                   className="flex gap-4 p-4 bg-[#050f2a] border border-[rgba(0,212,255,0.1)] items-center">
                <span className="text-4xl">{course.icon}</span>
                <div className="flex-1">
                  <p className="font-semibold">{course.title}</p>
                  <p className="text-sm text-[#6a8aaa]">{course.duration_hours}hs · {course.level}</p>
                </div>
                <p className="font-orbitron text-cyan-400">{fmtARS(course.price)}</p>
              </div>
            ))}

            {/* CUPÓN */}
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Código de descuento"
                value={couponInput}
                onChange={e => setCouponInput(e.target.value)}
                className="flex-1 bg-[rgba(0,212,255,0.05)] border border-[rgba(0,212,255,0.15)]
                           text-white px-4 py-2 text-sm focus:outline-none focus:border-cyan-400"
              />
              <button onClick={applyCoupon}
                      className="border border-violet-500 text-violet-400 px-4 py-2 text-sm
                                 hover:bg-violet-500 hover:text-white transition-all clip-btn-sm">
                Aplicar
              </button>
            </div>

            {/* MÉTODO DE PAGO */}
            <div>
              <h3 className="text-sm tracking-widest uppercase text-[#6a8aaa] mb-3">Método de pago</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'mp', icon: '💳', label: 'Mercado Pago' },
                  { id: 'transfer', icon: '🏦', label: 'Transferencia bancaria' },
                ].map(m => (
                  <button key={m.id} onClick={() => setMethod(m.id)}
                          className={`p-4 border text-center transition-all ${
                            method === m.id
                              ? 'border-cyan-400 bg-[rgba(0,212,255,0.1)] text-cyan-400'
                              : 'border-[rgba(0,212,255,0.1)] text-[#6a8aaa] hover:border-[rgba(0,212,255,0.3)]'
                          }`}>
                    <div className="text-2xl mb-1">{m.icon}</div>
                    <span className="text-sm">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {method === 'transfer' && (
              <div className="p-4 bg-[#050f2a] border border-[rgba(0,212,255,0.1)] text-sm space-y-2">
                <p className="text-cyan-400 font-semibold">Datos para transferencia</p>
                <p className="text-[#6a8aaa]">CBU: <span className="text-white font-mono">0000003100012345678900</span></p>
                <p className="text-[#6a8aaa]">Alias: <span className="text-white font-mono">LCCOURSES.PAGOS</span></p>
                <p className="text-[#6a8aaa]">Titular: <span className="text-white">LC-COURSES SRL</span></p>
                <p className="text-amber-400 text-xs mt-2">⚠️ Enviar comprobante a lccourses2026@gmail.com — acceso en 24hs.</p>
              </div>
            )}
          </div>

          {/* RESUMEN */}
          <div className="space-y-4">
            <div className="bg-[#050f2a] border border-[rgba(0,212,255,0.1)] p-6">
              <h3 className="font-orbitron text-sm text-cyan-400 mb-4">Resumen</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#6a8aaa]">Subtotal</span>
                  <span>{fmtARS(subtotal())}</span>
                </div>
                {discountPct > 0 && (
                  <div className="flex justify-between text-green-400">
                    <span>Descuento ({discountPct}%)</span>
                    <span>-{fmtARS(subtotal() * discountPct / 100)}</span>
                  </div>
                )}
                <div className="border-t border-[rgba(0,212,255,0.1)] pt-3 flex justify-between">
                  <span className="font-semibold">Total</span>
                  <span className="font-orbitron text-xl text-cyan-400"
                        style={{ textShadow: '0 0 20px rgba(0,255,247,0.4)' }}>
                    {fmtARS(total())}
                  </span>
                </div>
              </div>

              <div className="mt-6 space-y-3 text-xs text-[#6a8aaa]">
                {['✅ Acceso inmediato', '♾️ Acceso de por vida', '🏆 Certificado oficial', '🔄 Actualizaciones gratis'].map(f => (
                  <p key={f}>{f}</p>
                ))}
              </div>
            </div>

            {/* BOTÓN MP o TRANSFERENCIA */}
            {method === 'mp' ? (
              preferenceId ? (
                <div className="mp-wallet-container">
                  <Wallet
                    initialization={{ preferenceId }}
                    customization={{ texts: { action: 'pay', valueProp: 'smart_option' } }}
                  />
                </div>
              ) : (
                <button
                  onClick={createPreference}
                  disabled={loading || !items.length}
                  style={{ background: 'linear-gradient(135deg,#00d4ff,#bf00ff)' }}
                  className="w-full py-4 font-orbitron font-bold text-sm tracking-wider
                             text-white disabled:opacity-50 transition-all hover:shadow-[0_0_30px_rgba(0,212,255,0.4)] clip-btn">
                  {loading ? '⏳ Procesando...' : '💳 Pagar con Mercado Pago'}
                </button>
              )
            ) : (
              <button
                style={{ background: 'linear-gradient(135deg,#00d4ff,#bf00ff)' }}
                className="w-full py-4 font-orbitron font-bold text-sm tracking-wider text-white clip-btn"
                onClick={() => toast.success('Enviá el comprobante a lccourses2026@gmail.com')}>
                📤 Ya realicé la transferencia
              </button>
            )}

            <p className="text-center text-xs text-[#6a8aaa]">
              🔒 Pago seguro · SSL · Mercado Pago
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
