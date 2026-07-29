import dynamic from 'next/dynamic';

// Harita bileşenimizi sadece tarayıcı tarafında çalışacak şekilde (SSR kapalı) çağırıyoruz
const MapDrawTool = dynamic(
  () => import('../components/Map/MapDrawTool'),
  { ssr: false }
);

export default function Home() {
  return (
    <main className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">
        Bölge Seçimi ve Çizim Aracı
      </h1>
      
      {/* Kendi yazdığımız harita aracını tam buraya, ekrana basıyoruz */}
      <MapDrawTool />
    </main>
  );
}