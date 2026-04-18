import './globals.css';

export const metadata = {
  title: 'Conoce tu Colonia — Vista por capas',
  description:
    'Explora la CDMX por capas: transporte, seguridad, eventos, baños públicos e incidentes.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#05080c',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
