'use client';

import { useEffect, useState } from 'react';
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

import RegionImagery from '@/components/RegionImagery';

const ACCENT = {
  ndvi: '#2F6F52',
  pollution: '#3B82F6',
};

const RISK_LABELS = { yok: 'Yok', dusuk: 'Düşük', orta: 'Orta', yuksek: 'Yüksek' };
const RISK_PERCENT = { yok: 4, dusuk: 28, orta: 58, yuksek: 90 };

// NDVI'da bir noktanın diğer tüm noktaların ortalamasından bu kadar (mutlak)
// sapması durumunda "anormal dalgalanma" olarak işaretliyoruz. 0-1 aralığında
// 0.15, gözle görülür bir bitki örtüsü kaybı/artışına denk gelir.
const ANOMALY_THRESHOLD = 0.15;

function normalizeRisk(value) {
  if (!value) return 'yok';
  return value.toLowerCase();
}

function KpiCard({ label, value, sublabel, accent }) {
  return (
    <div className="relative bg-white border border-[#E2E4E8] rounded-lg p-5 overflow-hidden transition-shadow hover:shadow-sm">
      <span
        className="absolute top-0 left-0 right-0 h-[3px]"
        style={{ backgroundColor: accent }}
      />
      <p className="text-[11px] tracking-[0.12em] uppercase text-[#6B7280] mb-3">
        {label}
      </p>
      <p className="font-data text-3xl text-[#1C2128] tracking-tight tabular-nums">
        {value}
      </p>
      <p className="text-xs text-[#9CA3AF] mt-2">{sublabel}</p>
    </div>
  );
}

function RiskBar({ percent, accent }) {
  return (
    <div className="w-full h-2 bg-[#F0F1F3] rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{ width: `${percent}%`, backgroundColor: accent }}
      />
    </div>
  );
}

// --- Ortak tooltip kabuğu ---
function TooltipShell({ children }) {
  return (
    <div className="bg-white border border-[#E2E4E8] rounded-md shadow-md px-3 py-2 text-xs">
      {children}
    </div>
  );
}

function NdviTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <TooltipShell>
      <p className="text-[#6B7280] mb-1">{label}</p>
      <p className="font-data text-sm font-semibold text-[#2F6F52] tabular-nums">
        {payload[0].value.toFixed(2)}
      </p>
    </TooltipShell>
  );
}

function DistributionTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0];
  return (
    <TooltipShell>
      <div className="flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: item.payload.fill }}
        />
        <span className="text-[#1C2128] font-medium">{item.name}</span>
      </div>
      <p className="font-data text-sm font-semibold text-[#1C2128] mt-1 tabular-nums">
        %{item.value}
      </p>
    </TooltipShell>
  );
}

// Backend bir bolge adi verilmediginde region_name'e koordinat metnini yaziyor
// ("37.5191, 36.8372"). Bu gercek bir yer adi degil; boyle bir deger geldiginde
// Nominatim'den il adi cekmemiz gerekiyor.
function isPlaceholderName(name) {
  return !name || /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(String(name).trim());
}

export default function Analytics({ data }) {
  // Koordinatlar sozlesmede data.coordinates altinda; ust duzey data.lat yok.
  const lat = data?.coordinates?.lat;
  const lon = data?.coordinates?.lon;
  const hasCoordinates = typeof lat === 'number' && typeof lon === 'number';

  const [provinceName, setProvinceName] = useState(
    isPlaceholderName(data?.region_name) ? null : data.region_name
  );

  // Backend bir bölge adı vermediyse, koordinatlardan otomatik il adı çekiyoruz
  // (ücretsiz OpenStreetMap Nominatim servisi ile).
  useEffect(() => {
    if (!hasCoordinates || !isPlaceholderName(data?.region_name)) return;

    const controller = new AbortController();
    fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=8&addressdetails=1`,
      { signal: controller.signal, headers: { 'Accept-Language': 'tr' } }
    )
      .then((res) => res.json())
      .then((json) => {
        const name =
          json?.address?.province || json?.address?.state || json?.address?.city || null;
        if (name) setProvinceName(name);
      })
      .catch(() => {});

    return () => controller.abort();
  }, [data, hasCoordinates, lat, lon]);

  if (!data) return null;

  const ndviHistory = [
    { ay: 'Oca', deger: 0.42 },
    { ay: 'Şub', deger: 0.48 },
    { ay: 'Mar', deger: 0.55 },
    { ay: 'Nis', deger: 0.63 },
    { ay: 'May', deger: data.ndvi_score ?? 0.75 },
  ];

  const currentPollution = normalizeRisk(data.pollution_level);

  const ndviPercent = Math.round((data.ndvi_score ?? 0) * 100);
  const pollutionPercent = RISK_PERCENT[currentPollution];
  const total = ndviPercent + pollutionPercent || 1;

  const aiData = [
    { ad: 'Bitki Örtüsü', deger: Math.round((ndviPercent / total) * 100) },
    { ad: 'Kirlilik', deger: Math.round((pollutionPercent / total) * 100) },
  ];

  const PIE_COLORS = [ACCENT.ndvi, ACCENT.pollution];

  // Anormal dalgalanma tespiti: HER noktayı, kendi dışındaki noktaların
  // ortalamasıyla karşılaştırıyoruz. Sapma eşik değerini aşan her nokta
  // "anomali" olarak işaretlenir (grafikte kırmızı nokta + uyarı listesinde).
  const anomalies = ndviHistory
    .map((point, index) => {
      const others = ndviHistory.filter((_, i) => i !== index).map((h) => h.deger);
      const othersAvg = others.reduce((sum, v) => sum + v, 0) / (others.length || 1);
      const deviation = point.deger - othersAvg;
      return { ...point, deviation, isAnomaly: Math.abs(deviation) > ANOMALY_THRESHOLD };
    })
    .filter((point) => point.isAnomaly);

  const hasAnomaly = anomalies.length > 0;

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

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#EAF4EF] border border-[#2F6F52]/20 w-fit">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#2F6F52] opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#2F6F52]" />
          </span>
          <span className="text-[11px] tracking-wide text-[#2F6F52] font-medium uppercase">
            {data.status ?? 'Tamamlandı'}
          </span>
        </div>
      </div>

      {/* KPI Kartları */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-3xl p-6 text-white shadow-xl">
          <p className="text-sm opacity-80">🍃 NDVI Skoru</p>
          <h2 className="text-5xl font-bold mt-3 tabular-nums">
            {data.ndvi_score ?? '0'}
          </h2>
          <p className="mt-4 text-sm opacity-80">Bitki örtüsü yoğunluğu</p>
        </div>

        <div className="bg-gradient-to-r from-yellow-500 to-orange-500 rounded-3xl p-6 text-white shadow-xl">
          <p className="text-sm opacity-80">🏭 Kirlilik</p>
          <h2 className="text-4xl font-bold mt-3">
            {RISK_LABELS[currentPollution]}
          </h2>
          <p className="mt-4 text-sm opacity-80">Çevresel etki</p>
        </div>

        <div className="bg-gradient-to-r from-blue-500 to-cyan-600 rounded-3xl p-6 text-white shadow-xl">
          <p className="text-sm opacity-80">📍 Bölge</p>
          <p className="text-lg font-bold mt-3 break-words">
            {provinceName ?? 'Bilinmiyor'}
          </p>
          <p className="mt-2 text-xs opacity-70 tabular-nums">
            {hasCoordinates ? `${lat.toFixed(4)}, ${lon.toFixed(4)}` : '—'}
          </p>
          <p className="mt-3 text-sm opacity-80">Analiz alanı</p>
        </div>
      </div>

      {/* Bölge Görünümü - analiz sonucunun görsel karşılığı */}
      <RegionImagery data={data} />

      {/* NDVI Grafiği */}
      <div className="bg-white border border-[#E2E4E8] rounded-lg p-6">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h3 className="text-base font-bold text-[#1C2128] mb-3">
              NDVI Değişim Analizi
            </h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ACCENT.ndvi }} />
                <span className="text-[11px] text-gray-500">Bu Ölçüm</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-gray-300" />
                <span className="text-[11px] text-gray-500">Önceki Ölçüm</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-baseline gap-3 mb-6">
          <span
            className="font-data text-3xl font-bold tabular-nums"
            style={{ color: ACCENT.ndvi }}
          >
            {(data.ndvi_score ?? 0).toFixed(2)}
          </span>
          <span className="font-data text-lg text-gray-400 tabular-nums">
            {ndviHistory[ndviHistory.length - 2]?.deger.toFixed(2)}
          </span>
        </div>

        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={ndviHistory} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="ndviGlowFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={ACCENT.ndvi} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={ACCENT.ndvi} stopOpacity={0} />
                </linearGradient>
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#F0F1F3" vertical={false} />

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
                content={<NdviTooltip />}
                cursor={{ stroke: ACCENT.ndvi, strokeDasharray: '4 4', strokeWidth: 1 }}
              />

              <Area
                type="monotone"
                dataKey="deger"
                stroke={ACCENT.ndvi}
                strokeWidth={2.5}
                fill="url(#ndviGlowFill)"
                filter="url(#glow)"
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  const isAnomalyPoint = anomalies.some((a) => a.ay === payload.ay);
                  if (!isAnomalyPoint) return null;
                  return (
                    <circle
                      key={`anomaly-${payload.ay}`}
                      cx={cx}
                      cy={cy}
                      r={6}
                      fill="#EF4444"
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  );
                }}
                activeDot={{
                  r: 6,
                  strokeWidth: 3,
                  stroke: '#fff',
                  fill: ACCENT.ndvi,
                }}
                animationDuration={800}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {hasAnomaly && (
          <div className="mt-4 flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2.5">
            <span className="text-amber-500 text-sm mt-0.5">⚠</span>
            <div className="text-xs text-amber-800 leading-relaxed">
              <p className="font-semibold mb-1">
                {anomalies.length > 1
                  ? `${anomalies.length} noktada anormal dalgalanma tespit edildi`
                  : 'Anormal dalgalanma tespit edildi'}
              </p>
              <ul className="space-y-0.5">
                {anomalies.map((a) => (
                  <li key={a.ay}>
                    <span className="font-medium">{a.ay}</span> ayı, ortalamaya göre{' '}
                    {a.deviation > 0 ? 'beklenenden çok yüksek' : 'beklenenden çok düşük'} bir
                    NDVI değeri ({a.deger.toFixed(2)}) gösteriyor.
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-amber-700">Sonuçları teyit etmeniz önerilir.</p>
            </div>
          </div>
        )}
      </div>

      {/* Kirlilik Göstergesi */}
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

      {/* Yapay Zekâ Dağılımı */}
      <div className="bg-white border border-[#E2E4E8] rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-[#1C2128]">
            Yapay Zekâ Tespit Dağılımı
          </h3>
        </div>

        <p className="text-[15px] text-[#374151] leading-relaxed mb-8 max-w-xl">
          Bu bölgede yapılan analizde, tespit edilen etkenlerin{' '}
          <span className="font-semibold text-[#1C2128]">%{aiData[0].deger}&apos;i bitki örtüsü</span>{' '}
          ve <span className="font-semibold text-[#1C2128]">%{aiData[1].deger}&apos;i kirlilik</span>{' '}
          kaynaklı unsurlara işaret ediyor.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8 items-center">
          {/* Sol: lejant grid */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-6">
            {aiData.map((item, index) => (
              <div key={item.ad}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: PIE_COLORS[index] }}
                  />
                  <span className="text-[13px] text-[#4B5563]">{item.ad}</span>
                </div>
                <p
                  className="font-data text-2xl font-bold tabular-nums"
                  style={{ color: PIE_COLORS[index] }}
                >
                  %{item.deger}
                </p>
              </div>
            ))}
          </div>

          {/* Sağ: etiketsiz donut */}
          <div className="w-[220px] h-[220px] mx-auto lg:mx-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={aiData}
                  dataKey="deger"
                  nameKey="ad"
                  innerRadius={62}
                  outerRadius={100}
                  paddingAngle={2}
                  stroke="#FFFFFF"
                  strokeWidth={2}
                  animationDuration={700}
                >
                  {aiData.map((entry, index) => (
                    <Cell key={index} fill={PIE_COLORS[index]} />
                  ))}
                </Pie>
                <Tooltip content={<DistributionTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <p className="text-[11px] text-[#9CA3AF] mt-8 pt-4 border-t border-[#F0F1F3]">
          Analiz tarihi:{' '}
          {data.timestamp ? new Date(data.timestamp).toLocaleString('tr-TR') : '—'} · Bu
          oranlar NDVI ve kirlilik risk modeline dayanmaktadır.
        </p>
      </div>
    </div>
  );
}