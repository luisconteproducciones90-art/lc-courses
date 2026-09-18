'use client';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { paymentsAPI } from '../../../lib/api';
import Link from 'next/link';

export default function PagoExitosoPage() {
  const params = useSearchParams();
  const router = useRouter();
  const orderId = params.get('order');
  const [order, setOrder] = useState(null);

  useEffect(() => {
    if (orderId) {
      paymentsAPI.getOrder(orderId).then(({ data }) => setOrder(data.order));
    }
    // Limpiar carrito
    const { useCartStore } = require('../../../store');
    useCartStore.getState().clearCart();
  }, [orderId]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative z-10">
      <div className="max-w-xl w-full bg-[#050f2a] border border-[rgba(0,255,136,0.2)] p-10 text-center">
        {/* Animación check */}
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
             style={{ background: 'rgba(0,255,136,0.1)', border: '2px solid #00ff88',
                      boxShadow: '0 0 30px rgba(0,255,136,0.3)' }}>
          <span className="text-4xl">✓</span>
        </div>

        <h1 className="font-orbitron text-2xl font-bold text-green-400 mb-2">
          ¡Pago exitoso!
        </h1>
        <p className="text-[#6a8aaa] mb-6">
          Tu compra fue procesada correctamente. Ya tenés acceso a tus cursos.
        </p>

        {order && (
          <div className="bg-[rgba(0,255,136,0.05)] border border-[rgba(0,255,136,0.1)] p-4 mb-6 text-sm text-left space-y-2">
            <p className="text-[#6a8aaa]">N° de orden: <span className="font-mono text-green-400">{order.id}</span></p>
            <p className="text-[#6a8aaa]">Total: <span className="text-white font-semibold">
              ${order.total?.toLocaleString('es-AR')}
            </span></p>
            {order.items?.map(item => (
              <p key={item.course_id} className="text-cyan-400">✓ {item.title}</p>
            ))}
          </div>
        )}

        <p className="text-xs text-[#6a8aaa] mb-6">
          📧 Revisá tu email — enviamos la confirmación con los detalles de tu compra.
        </p>

        <div className="flex gap-3 justify-center flex-wrap">
          <Link href="/dashboard"
                style={{ background: 'linear-gradient(135deg,#00d4ff,#bf00ff)' }}
                className="px-6 py-3 font-orbitron text-sm font-bold text-white clip-btn">
            Ir a mis cursos →
          </Link>
          <Link href="/cursos"
                className="px-6 py-3 border border-[rgba(0,212,255,0.3)] text-[#6a8aaa]
                           text-sm hover:border-cyan-400 hover:text-cyan-400 transition-all">
            Ver más cursos
          </Link>
        </div>
      </div>
    </div>
  );
}
