'use client';

import { useState } from 'react';
import { jsPDF } from 'jspdf';
import { FileText, Download, X, Loader2 } from 'lucide-react';
import {
  analysisImageUrl,
  composeChangeMapDataUrl,
  embedTurkishFont,
  fetchTileDataUrl,
} from '@/lib/pdfAssets';

const RISK_LABELS = { yok: 'Yok', dusuk: 'Düşük', orta: 'Orta', yuksek: 'Yüksek' };
const SEVERITY_LABELS = { CRITICAL: 'Kritik', HIGH: 'Yüksek', LOW: 'Düşük' };

// A4: 210 x 297 mm
const PAGE = { width: 210, height: 297, margin: 20 };
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

function riskLabel(value) {
  if (!value) return 'Bilinmiyor';
  return RISK_LABELS[String(value).toLowerCase()] ?? value;
}

function clampPercent(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

/** Rapordaki tum degerleri tek yerden turetiyoruz; ekranla ayni kaynak. */
function readAnalysis(data) {
  const ai = data?.ai_results ?? {};
  const deforestation = ai.change_detection?.deforestation ?? {};
  const pollution = ai.pollution ?? {};
  const metrics = ai.environmental_metrics ?? {};
  const detections = ai.yolo_detections ?? [];

  return {
    regionName: data?.region_name || 'Bilinmeyen Bölge',
    coordinates: data?.coordinates ?? null,
    ndvi: data?.ndvi_score ?? 0,
    ndviChange: metrics.ndvi_change ?? 0,
    fireRisk: riskLabel(data?.fire_risk),
    pollutionLevel: riskLabel(data?.pollution_level),
    pollutionPercent: clampPercent(
      data?.pollution_percentage ?? pollution.coverage_percentage
    ),
    // Onceki surum data.deforestation_risk okuyordu; sozlesmede boyle bir alan
    // yok, bu yuzden raporda hep "N/A" yaziyordu.
    deforestationSeverity: SEVERITY_LABELS[deforestation.severity] ?? 'Bilinmiyor',
    deforestationPercent: deforestation.detected
      ? clampPercent(deforestation.loss_percentage)
      : 0,
    detectionCount: detections.length,
    demoMode: Boolean(data?.demo_mode),
    modelLoaded: data?.model_loaded !== false,
    images: data?.images ?? null,
    timestamp: data?.timestamp,
  };
}

export default function Report({ data }) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const analysis = readAnalysis(data);

  const generatePDF = async () => {
    if (isGenerating) return;
    setIsGenerating(true);

    try {
      const doc = new jsPDF();
      const hasFont = await embedTurkishFont(doc);
      const font = hasFont ? 'Roboto' : 'helvetica';

      // --- Sayfa 1: ozet ---
      doc.setFont(font, 'bold');
      doc.setFontSize(20);
      doc.setTextColor(22, 163, 74);
      doc.text('GeoMorphosis Analiz Raporu', PAGE.margin, 28);

      doc.setDrawColor(229, 231, 235);
      doc.line(PAGE.margin, 33, PAGE.width - PAGE.margin, 33);

      doc.setFont(font, 'normal');
      doc.setFontSize(11);
      doc.setTextColor(107, 114, 128);

      const generatedAt = analysis.timestamp
        ? new Date(analysis.timestamp).toLocaleString('tr-TR')
        : new Date().toLocaleString('tr-TR');

      doc.text(`Bölge: ${analysis.regionName}`, PAGE.margin, 42);
      doc.text(`Rapor tarihi: ${generatedAt}`, PAGE.margin, 48);

      if (analysis.coordinates) {
        const { lat, lon, buffer_meters: buffer } = analysis.coordinates;
        const coordText =
          typeof lat === 'number' && typeof lon === 'number'
            ? `Koordinat: ${lat.toFixed(4)}, ${lon.toFixed(4)} · Tampon: ${buffer} m`
            : `Tampon: ${buffer} m`;
        doc.text(coordText, PAGE.margin, 54);
      }

      // Olcum tablosu
      const rows = [
        ['NDVI skoru', String(analysis.ndvi)],
        ['NDVI değişimi', `${analysis.ndviChange > 0 ? '+' : ''}${analysis.ndviChange}`],
        ['Yangın riski', analysis.fireRisk],
        ['Kirlilik alanı', `%${analysis.pollutionPercent} (${analysis.pollutionLevel})`],
        [
          'Bitki örtüsü kaybı',
          `%${analysis.deforestationPercent} (${analysis.deforestationSeverity})`,
        ],
        ['Model tespiti', `${analysis.detectionCount} adet`],
      ];

      let y = 66;
      doc.setFontSize(12);
      doc.setFont(font, 'bold');
      doc.setTextColor(28, 33, 40);
      doc.text('Model Sonuçları', PAGE.margin, y);
      y += 8;

      doc.setFontSize(11);
      rows.forEach(([label, value]) => {
        doc.setFont(font, 'normal');
        doc.setTextColor(107, 114, 128);
        doc.text(label, PAGE.margin, y);
        doc.setFont(font, 'bold');
        doc.setTextColor(28, 33, 40);
        doc.text(value, PAGE.margin + 70, y);
        doc.setDrawColor(240, 241, 243);
        doc.line(PAGE.margin, y + 2.5, PAGE.width - PAGE.margin, y + 2.5);
        y += 10;
      });

      // Verinin nereden geldigi konusunda seffaf ol
      y += 4;
      doc.setFont(font, 'normal');
      doc.setFontSize(9);
      doc.setTextColor(156, 163, 175);

      if (analysis.demoMode) {
        doc.text(
          'Uyarı: Uydu verisi alınamadığı için değerler demo modunda üretilmiştir.',
          PAGE.margin,
          y
        );
        y += 5;
      }
      if (!analysis.modelLoaded) {
        doc.text(
          'Uyarı: Nesne tespit modeli yüklenemedi; risk değerleri yalnızca NDVI değişimine dayanıyor.',
          PAGE.margin,
          y
        );
      }

      // --- Sayfa 2: uydu goruntuleri ---
      await appendImagery(doc, font, analysis);

      addFooter(doc, font);
      doc.save(`geomorphosis-rapor-${Date.now()}.pdf`);
    } catch (error) {
      console.error('PDF üretilemedi:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsPreviewOpen(true)}
        className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white px-4 py-3 rounded-xl hover:bg-black transition-colors font-medium shadow-md"
      >
        <FileText size={20} />
        Raporu İncele ve İndir
      </button>

      {/* Önizleme Modal'ı */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">

            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <FileText className="text-primary-600" size={24} />
                Rapor Önizleme
              </h3>
              <button
                onClick={() => setIsPreviewOpen(false)}
                className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto">
              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-6 space-y-4">
                <PreviewRow label="Bölge" value={analysis.regionName} />
                <PreviewRow label="NDVI Skoru" value={analysis.ndvi} valueClass="text-green-600" />
                <PreviewRow
                  label="Bitki Örtüsü Kaybı"
                  value={`%${analysis.deforestationPercent}`}
                  valueClass="text-orange-600"
                />
                <PreviewRow
                  label="Kirlilik Alanı"
                  value={`%${analysis.pollutionPercent}`}
                  valueClass="text-yellow-600"
                />
                <PreviewRow label="Yangın Riski" value={analysis.fireRisk} valueClass="text-red-600" />
                <PreviewRow
                  label="Uydu Görüntüsü"
                  value={analysis.images?.available ? 'Rapora eklenecek' : 'Yok'}
                  last
                />
              </div>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-4">
              <button
                onClick={() => setIsPreviewOpen(false)}
                className="flex-1 px-4 py-3 rounded-xl bg-white border border-gray-200 text-gray-700 font-medium hover:bg-gray-100 transition-colors"
              >
                Kapat
              </button>
              <button
                onClick={generatePDF}
                disabled={isGenerating}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-700 transition-colors shadow-lg shadow-primary-500/30 disabled:opacity-60"
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Hazırlanıyor...
                  </>
                ) : (
                  <>
                    <Download size={20} />
                    PDF İndir
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}

function PreviewRow({ label, value, valueClass = 'text-gray-800', last = false }) {
  return (
    <div className={`flex justify-between ${last ? 'pb-1' : 'border-b border-gray-200 pb-3'}`}>
      <span className="text-gray-500">{label}:</span>
      <span className={`font-semibold ${valueClass}`}>{value}</span>
    </div>
  );
}

/** Uydu goruntulerini ve degisim haritasini ikinci sayfaya ekler. */
async function appendImagery(doc, font, analysis) {
  const images = analysis.images;
  const coords = analysis.coordinates;

  if (
    !images?.available ||
    !coords ||
    !Array.isArray(images.years) ||
    images.years.length === 0
  ) {
    return;
  }

  const url = (year, kind) =>
    analysisImageUrl({ lat: coords.lat, lon: coords.lon, year, kind });

  const firstYear = images.years[0];
  const lastYear = images.years[images.years.length - 1];

  const [beforeTile, afterTile, changeMap] = await Promise.all([
    fetchTileDataUrl(url(firstYear, 'rgb')),
    fetchTileDataUrl(url(lastYear, 'rgb')),
    images.change_map
      ? composeChangeMapDataUrl(url(lastYear, 'rgb'), url(null, 'diff'))
      : Promise.resolve(null),
  ]);

  if (!beforeTile && !afterTile && !changeMap) return;

  doc.addPage();
  doc.setFont(font, 'bold');
  doc.setFontSize(16);
  doc.setTextColor(28, 33, 40);
  doc.text('Uydu Görüntüsü Karşılaştırması', PAGE.margin, 28);

  // Yan yana yerlesim: arayuzdeki kaydiracin PDF karsiligi
  const gap = 6;
  const tileSize = (CONTENT_WIDTH - gap) / 2;
  let y = 36;

  doc.setFont(font, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  doc.text(String(firstYear), PAGE.margin, y);
  doc.text(String(lastYear), PAGE.margin + tileSize + gap, y);
  y += 3;

  if (beforeTile) {
    doc.addImage(beforeTile, 'JPEG', PAGE.margin, y, tileSize, tileSize);
  }
  if (afterTile) {
    doc.addImage(afterTile, 'JPEG', PAGE.margin + tileSize + gap, y, tileSize, tileSize);
  }
  y += tileSize + 12;

  if (changeMap) {
    doc.setFont(font, 'bold');
    doc.setFontSize(14);
    doc.setTextColor(28, 33, 40);
    doc.text('Değişim Haritası', PAGE.margin, y);
    y += 6;

    doc.setFont(font, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text(
      `${images.change_map.from_year}-${images.change_map.to_year} arası NDVI farkı · ` +
        'kırmızı: bitki kaybı, yeşil: artış',
      PAGE.margin,
      y
    );
    y += 4;

    const mapSize = Math.min(tileSize * 1.4, PAGE.height - y - 25);
    doc.addImage(changeMap, 'JPEG', PAGE.margin, y, mapSize, mapSize);
  }
}

function addFooter(doc, font) {
  const pageCount = doc.getNumberOfPages();

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont(font, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(156, 163, 175);
    doc.text(
      'Bu rapor GeoMorphosis AI Engine tarafından otomatik üretilmiştir.',
      PAGE.margin,
      PAGE.height - 12
    );
    doc.text(`${page} / ${pageCount}`, PAGE.width - PAGE.margin, PAGE.height - 12, {
      align: 'right',
    });
  }
}
