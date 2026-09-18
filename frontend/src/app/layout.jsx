import './globals.css';
import { Orbitron, Exo_2 } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import WhatsAppButton from '../components/layout/WhatsAppButton';
import Navbar from '../components/layout/Navbar';

const orbitron = Orbitron({ subsets: ['latin'], variable: '--font-orbitron', weight: ['400','700','900'] });
const exo2 = Exo_2({ subsets: ['latin'], variable: '--font-exo', weight: ['300','400','600','700'] });

export const metadata = {
  title: 'LC-COURSES | Aprendé Hoy, Creá Tu Futuro',
  description: 'Plataforma de cursos online con certificación profesional. Tecnología, Diseño, IA, Marketing y más. Buenos Aires, Argentina.',
  keywords: 'cursos online, capacitación online, certificados, argentina, tecnología, diseño, marketing',
  openGraph: {
    title: 'LC-COURSES | Capacitación Profesional Online',
    description: 'Más de 30 cursos online con certificación. Acceso inmediato desde cualquier dispositivo.',
    url: 'https://lccourses.com',
    siteName: 'LC-COURSES',
    locale: 'es_AR',
    type: 'website',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={`${orbitron.variable} ${exo2.variable}`}>
      <head>
        <link rel="icon" href="/favicon.ico" />
        <meta name="theme-color" content="#020818" />
      </head>
      <body>
        <Navbar />
        <main>{children}</main>
        <WhatsAppButton />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#050f2a',
              color: '#e8f4ff',
              border: '1px solid rgba(0,212,255,0.2)',
              fontFamily: 'var(--font-exo)',
            },
            success: { iconTheme: { primary: '#00fff7', secondary: '#020818' } },
            error: { iconTheme: { primary: '#ff4466', secondary: '#020818' } },
          }}
        />
      </body>
    </html>
  );
}
