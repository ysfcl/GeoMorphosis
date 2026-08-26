import '@/styles/index.css';

export const metadata = {
  title: 'GeoMorphosis - Cevresel monitoring & Erken Uyari',
  description: 'Uydu goruntusu ile yapay zeka destekli cevresel monitoring platformu',
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
