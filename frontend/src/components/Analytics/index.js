'use client';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

// Rapor bileşenini import ediyoruz
import Report from '@/components/Report';

const RISK_LABELS = {
  yok: 'Yok',
  dusuk: 'Düşük',
  orta: 'Orta',
  yuksek: 'Yüksek',
};

const RISK_WIDTH = {
  yok: '8%',
  dusuk: '25%',
  orta: '55%',
  yuksek: '90%',
};

const RISK_COLOR = {
  yok: 'bg-gray-300',
  dusuk: 'bg-green-500',
  orta: 'bg-yellow-500',
  yuksek: 'bg-red-500',
};

function normalizeRisk(value) {
  if (!value) return 'yok';
  return value.toLowerCase();
}

export default function Analytics({ data }) {
  if (!data) return null;

  const ndviHistory = [
    { ay: 'Ocak', deger: 0.42 },
    { ay: 'Şubat', deger: 0.48 },
    { ay: 'Mart', deger: 0.55 },
    { ay: 'Nisan', deger: 0.63 },
    { ay: 'Mayıs', deger: data.ndvi_score ?? 0.75 },
  ];

  const currentRisk = normalizeRisk(data.fire_risk);
  const currentPollution = normalizeRisk(data.pollution_level);

  // Donut chart artık gerçek verilerle besleniyor (sabit değerler değil)

  const ndviPercent = Math.round((data.ndvi_score ?? 0) * 100);

  const riskToScore = { yok: 0, dusuk: 15, orta: 50, yuksek: 85 };

  const firePercent = riskToScore[currentRisk];
  const pollutionPercent = riskToScore[currentPollution];

  const total = ndviPercent + firePercent + pollutionPercent || 1;

  const aiData = [
    { ad: 'Bitki Örtüsü', deger: Math.round((ndviPercent / total) * 100) },
    { ad: 'Yangın Riski', deger: Math.round((firePercent / total) * 100) },
    { ad: 'Kirlilik', deger: Math.round((pollutionPercent / total) * 100) },
  ];

  const COLORS = ['#22c55e', '#ef4444', '#eab308'];

  return (
    <div className="space-y-8">
      {/* Başlık */}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">
            GeoMorphosis Analiz Paneli
          </h1>

          <p className="text-gray-500 mt-2">
            Uydu verileri ve yapay zekâ destekli çevresel analiz
          </p>
        </div>

        {/* Durum rozeti ve Rapor butonu yan yana eklendi */}
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <span className="px-4 py-2 rounded-full bg-green-100 text-green-700 font-semibold whitespace-nowrap">
            ● {data.status ?? 'Analiz tamamlandı'}
          </span>
          <div className="w-full sm:w-56">
            <Report data={data} />
          </div>
        </div>
      </div>

      {/* Üst Kartlar */}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-3xl p-6 text-white shadow-xl">
          <p className="text-sm opacity-80">
            🌿 NDVI Skoru
          </p>

          <h2 className="text-5xl font-bold mt-3">
            {data.ndvi_score ?? '0'}
          </h2>

          <p className="mt-4 text-sm opacity-80">
            Bitki örtüsü yoğunluğu
          </p>
        </div>

        <div className="bg-gradient-to-r from-red-500 to-rose-600 rounded-3xl p-6 text-white shadow-xl">
          <p className="text-sm opacity-80">
            🔥 Yangın Riski
          </p>

          <h2 className="text-4xl font-bold mt-3">
            {RISK_LABELS[currentRisk]}
          </h2>

          <p className="mt-4 text-sm opacity-80">
            Risk seviyesi
          </p>
        </div>

        <div className="bg-gradient-to-r from-yellow-500 to-orange-500 rounded-3xl p-6 text-white shadow-xl">
          <p className="text-sm opacity-80">
            🏭 Kirlilik
          </p>

          <h2 className="text-4xl font-bold mt-3">
            {RISK_LABELS[currentPollution]}
          </h2>

          <p className="mt-4 text-sm opacity-80">
            Çevresel etki
          </p>
        </div>

        <div className="bg-gradient-to-r from-blue-500 to-cyan-600 rounded-3xl p-6 text-white shadow-xl">
          <p className="text-sm opacity-80">
            📍 Bölge
          </p>

          <p className="text-lg font-bold mt-3 break-words">
            {data.region_name ?? 'Bilinmiyor'}
          </p>

          <p className="mt-4 text-sm opacity-80">
            Analiz alanı
          </p>
        </div>
      </div>

      {/* NDVI Grafiği */}

      <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-bold text-gray-800">
            🌿 NDVI Değişim Analizi
          </h3>

          <span className="px-4 py-2 rounded-full bg-green-100 text-green-700">
            Son değer: {data.ndvi_score}
          </span>
        </div>

        <div className="h-[420px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={ndviHistory}>
              <defs>
                <linearGradient
                  id="ndviGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor="#22c55e"
                    stopOpacity={0.6}
                  />

                  <stop
                    offset="95%"
                    stopColor="#22c55e"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="4 4"
                stroke="#e5e7eb"
              />

              <XAxis dataKey="ay" />

              <YAxis domain={[0, 1]} />

              <Tooltip />

              <Area
                type="monotone"
                dataKey="deger"
                stroke="#16a34a"
                strokeWidth={4}
                fill="url(#ndviGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Risk Göstergeleri */}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl shadow-xl p-8">
          <h3 className="text-2xl font-bold mb-8">
            🔥 Yangın Riski
          </h3>

          <div className="w-full bg-gray-200 rounded-full h-8 overflow-hidden">
            <div
              className={`${RISK_COLOR[currentRisk]} h-full rounded-full transition-all duration-700`}
              style={{
                width: RISK_WIDTH[currentRisk],
              }}
            />
          </div>

          <p className="text-center text-3xl font-bold mt-8">
            {RISK_LABELS[currentRisk]}
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl p-8">
          <h3 className="text-2xl font-bold mb-8">
            🏭 Kirlilik Seviyesi
          </h3>

          <div className="w-full bg-gray-200 rounded-full h-8 overflow-hidden">
            <div
              className={`${RISK_COLOR[currentPollution]} h-full rounded-full transition-all duration-700`}
              style={{
                width: RISK_WIDTH[currentPollution],
              }}
            />
          </div>

          <p className="text-center text-3xl font-bold mt-8">
            {RISK_LABELS[currentPollution]}
          </p>
        </div>
      </div>

      {/* Yapay Zekâ Dağılımı */}

      <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-8">
        <h3 className="text-2xl font-bold mb-8 text-gray-800">
          📊 Yapay Zekâ Tespit Dağılımı
        </h3>

        <div className="h-[420px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={aiData}
                dataKey="deger"
                nameKey="ad"
                innerRadius={90}
                outerRadius={150}
                paddingAngle={5}
                label={({ ad, percent }) =>
                  `${ad} %${(percent * 100).toFixed(0)}`
                }
              >
                {aiData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={COLORS[index]}
                  />
                ))}
              </Pie>

              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {data.timestamp && (
        <div className="text-center text-sm text-gray-500">
          Son güncelleme
          <br />
          {new Date(data.timestamp).toLocaleString('tr-TR')}
        </div>
      )}
    </div>
  );
}