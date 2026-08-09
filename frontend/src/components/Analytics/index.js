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

<<<<<<< HEAD
const ACCENT = {
  ndvi: '#2F6F52',
  fire: '#EF4444',
  pollution: '#3B82F6',
=======
// Rapor bileşenini import ediyoruz
import Report from '@/components/Report';

const RISK_LABELS = {
  yok: 'Yok',
  dusuk: 'Düşük',
  orta: 'Orta',
  yuksek: 'Yüksek',
>>>>>>> origin/main
};

const RISK_LABELS = { yok: 'Yok', dusuk: 'Düşük', orta: 'Orta', yuksek: 'Yüksek' };
const RISK_PERCENT = { yok: 4, dusuk: 28, orta: 58, yuksek: 90 };

function normalizeRisk(value) {
  if (!value) return 'yok';
  return value.toLowerCase();
}

function KpiCard({ label, value, sublabel, accent }) {
  return (
    <div className="relative bg-white border border-[#E2E4E8] rounded-lg p-5 overflow-hidden">
      <span
        className="absolute top-0 left-0 right-0 h-[3px]"
        style={{ backgroundColor: accent }}
      />

      <p className="text-[11px] tracking-[0.12em] uppercase text-[#6B7280] mb-3">
        {label}
      </p>

      <p className="font-data text-3xl text-[#1C2128] tracking-tight">
        {value}
      </p>

      <p className="text-xs text-[#9CA3AF] mt-2">
        {sublabel}
      </p>
    </div>
  );
}

function RiskBar({ percent, accent }) {
  return (
    <div className="w-full h-2 bg-[#F0F1F3] rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${percent}%`, backgroundColor: accent }}
      />
    </div>
  );
}

export default function Analytics({ data }) {
  if (!data) return null;

  const ndviHistory = [
    { ay: 'Oca', deger: 0.42 },
    { ay: 'Şub', deger: 0.48 },
    { ay: 'Mar', deger: 0.55 },
    { ay: 'Nis', deger: 0.63 },
    { ay: 'May', deger: data.ndvi_score ?? 0.75 },
  ];

  const currentRisk = normalizeRisk(data.fire_risk);
  const currentPollution = normalizeRisk(data.pollution_level);

  const ndviPercent = Math.round((data.ndvi_score ?? 0) * 100);
  const firePercent = RISK_PERCENT[currentRisk];
  const pollutionPercent = RISK_PERCENT[currentPollution];
  const total = ndviPercent + firePercent + pollutionPercent || 1;

  const aiData = [
    { ad: 'Bitki Örtüsü', deger: Math.round((ndviPercent / total) * 100) },
    { ad: 'Yangın Riski', deger: Math.round((firePercent / total) * 100) },
    { ad: 'Kirlilik', deger: Math.round((pollutionPercent / total) * 100) },
  ];

  const PIE_COLORS = [ACCENT.ndvi, ACCENT.fire, ACCENT.pollution];

  return (
    <div className="space-y-5">

      {/* Başlık */}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-5 border-b border-[#E2E4E8]">
        <div>
          <p className="text-[11px] tracking-[0.15em] uppercase text-[#6B7280] mb-1">
            Bölge Analizi
          </p>

          <h1 className="text-xl font-semibold text-[#1C2128] tracking-tight">
            GeoMorphosis Analiz Paneli
          </h1>
        </div>

<<<<<<< HEAD
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#EAF4EF] border border-[#2F6F52]/20 w-fit">
          <span className="w-1.5 h-1.5 rounded-full bg-[#2F6F52]" />

          <span className="text-[11px] tracking-wide text-[#2F6F52] font-medium uppercase">
            {data.status ?? 'Tamamlandı'}
          </span>
=======
        {/* Durum rozeti ve Rapor butonu yan yana eklendi */}
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <span className="px-4 py-2 rounded-full bg-green-100 text-green-700 font-semibold whitespace-nowrap">
            ● {data.status ?? 'Analiz tamamlandı'}
          </span>
          <div className="w-full sm:w-56">
            <Report data={data} />
          </div>
>>>>>>> origin/main
        </div>
      </div>

      {/* KPI Kartları */}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="NDVI Skoru"
          value={data.ndvi_score ?? '0.00'}
          sublabel="Bitki örtüsü yoğunluğu"
          accent={ACCENT.ndvi}
        />

        <KpiCard
          label="Yangın Riski"
          value={RISK_LABELS[currentRisk]}
          sublabel="Risk seviyesi"
          accent={ACCENT.fire}
        />

        <KpiCard
          label="Kirlilik"
          value={RISK_LABELS[currentPollution]}
          sublabel="Çevresel etki"
          accent={ACCENT.pollution}
        />

        <KpiCard
          label="Koordinat"
          value={`${(data.lat ?? 0).toFixed(2)}, ${(data.lon ?? 0).toFixed(2)}`}
          sublabel={data.region_name ?? 'Analiz alanı'}
          accent="#9CA3AF"
        />
      </div>

      {/* NDVI Grafiği */}

      <div className="bg-white border border-[#E2E4E8] rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <p className="text-[11px] tracking-[0.12em] uppercase text-[#6B7280]">
            NDVI Değişim Analizi
          </p>

          <span className="font-data text-sm text-[#2F6F52] font-medium">
            {data.ndvi_score}
          </span>
        </div>

        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={ndviHistory}>
              <defs>
                <linearGradient id="ndviGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2F6F52" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#2F6F52" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#F0F1F3"
                vertical={false}
              />

              <XAxis
                dataKey="ay"
                stroke="#9CA3AF"
                tick={{ fontSize: 11 }}
                axisLine={{ stroke: '#E2E4E8' }}
                tickLine={false}
              />

              <YAxis
                domain={[0, 1]}
                stroke="#9CA3AF"
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />

              <Tooltip
                contentStyle={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E4E8',
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelStyle={{ color: '#6B7280' }}
              />

              <Area
                type="monotone"
                dataKey="deger"
                stroke="#2F6F52"
                strokeWidth={2}
                fill="url(#ndviGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Risk Göstergeleri */}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-[#E2E4E8] rounded-lg p-6">
          <div className="flex items-center justify-between mb-5">
            <p className="text-[11px] tracking-[0.12em] uppercase text-[#6B7280]">
              Yangın Riski
            </p>

            <span className="text-sm font-medium" style={{ color: ACCENT.fire }}>
              {RISK_LABELS[currentRisk]}
            </span>
          </div>

          <RiskBar percent={RISK_PERCENT[currentRisk]} accent={ACCENT.fire} />
        </div>

        <div className="bg-white border border-[#E2E4E8] rounded-lg p-6">
          <div className="flex items-center justify-between mb-5">
            <p className="text-[11px] tracking-[0.12em] uppercase text-[#6B7280]">
              Kirlilik Seviyesi
            </p>

            <span className="text-sm font-medium" style={{ color: ACCENT.pollution }}>
              {RISK_LABELS[currentPollution]}
            </span>
          </div>

          <RiskBar percent={RISK_PERCENT[currentPollution]} accent={ACCENT.pollution} />
        </div>
      </div>

      {/* Yapay Zekâ Dağılımı */}

      <div className="bg-white border border-[#E2E4E8] rounded-lg p-6">
        <p className="text-[11px] tracking-[0.12em] uppercase text-[#6B7280] mb-6">
          Yapay Zekâ Tespit Dağılımı
        </p>

        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={aiData}
                dataKey="deger"
                nameKey="ad"
                innerRadius={75}
                outerRadius={125}
                paddingAngle={3}
                stroke="#FFFFFF"
                strokeWidth={2}
                label={({ ad, percent }) => `${ad} ${(percent * 100).toFixed(0)}%`}
                labelLine={{ stroke: '#D3D6DC' }}
              >
                {aiData.map((entry, index) => (
                  <Cell key={index} fill={PIE_COLORS[index]} />
                ))}
              </Pie>

              <Tooltip
                contentStyle={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E4E8',
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {data.timestamp && (
        <p className="text-xs text-[#9CA3AF] text-center">
          Son güncelleme · {new Date(data.timestamp).toLocaleString('tr-TR')}
        </p>
      )}
    </div>
  );
}