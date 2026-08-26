'use client';

import { useState } from 'react';
import { FileText, Download, X, Loader2 } from 'lucide-react';
import {
  buildAnalysisReportPdf,
  readAnalysis,
} from '@/lib/pdfReport';

// PDF uretim mantigi lib/pdfReport.js'te yasiyor; e-posta eki de AYNI
// fonksiyonu kullanir, boylece iki cikti birebir aynidir.

export default function Report({ data }) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const analysis = readAnalysis(data);

  const generatePDF = async () => {
    if (isGenerating) return;
    setIsGenerating(true);

    try {
      const doc = await buildAnalysisReportPdf(data);
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
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto flex flex-col">

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
                  label="Ormansızlaşma"
                  value={`${analysis.deforestationRisk} (%${analysis.deforestationPercent})`}
                  valueClass="text-orange-600"
                />
                <PreviewRow
                  label="Kirlilik"
                  value={
                    analysis.pollutionLevel +
                    (analysis.pollutionAod != null
                      ? ` · AOD ${analysis.pollutionAod.toFixed(2)}`
                      : '')
                  }
                  valueClass="text-yellow-600"
                />
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
