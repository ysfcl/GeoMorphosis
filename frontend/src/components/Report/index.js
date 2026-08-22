'use client';

import { useState } from 'react';
import { jsPDF } from 'jspdf';
import { FileText, Download, X } from 'lucide-react';

export default function Report({ data }) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const generatePDF = () => {
    // A4 boyutunda yeni bir PDF dokümanı oluşturuyoruz
    const doc = new jsPDF();

    // Başlık
    doc.setFontSize(22);
    doc.setTextColor(22, 163, 74); // Tailwind green-600
    doc.text('GeoMorphosis Analiz Raporu', 20, 30);

    // Çizgi
    doc.setDrawColor(229, 231, 235); // Tailwind gray-200
    doc.line(20, 35, 190, 35);

    // İçerik Ayarları
    doc.setFontSize(12);
    doc.setTextColor(55, 65, 81); // Tailwind gray-700

    const date = new Date().toLocaleString('tr-TR');
    const region = data?.region_name || 'Bilinmeyen Bölge';
    const ndvi = data?.ndvi_score || 'N/A';
    const deforestationRisk = data?.deforestation_risk || 'N/A';
    const pollution = data?.pollution_level || 'N/A';

    let yPos = 50;
    const lineSpacing = 12;

    doc.text(`Tarih: ${date}`, 20, yPos);
    yPos += lineSpacing;
    doc.text(`Bolge: ${region}`, 20, yPos);
    yPos += lineSpacing;
    doc.text(`NDVI Skoru: ${ndvi}`, 20, yPos);
    yPos += lineSpacing;
    doc.text(`Ormansizlasma Riski: ${deforestationRisk.toUpperCase()}`, 20, yPos);
    yPos += lineSpacing;
    doc.text(`Kirlilik Seviyesi: ${pollution.toUpperCase()}`, 20, yPos);

    // Footer
    doc.setFontSize(10);
    doc.setTextColor(156, 163, 175); // Tailwind gray-400
    doc.text('Bu rapor GeoMorphosis AI Engine tarafindan otomatik uretilmistir.', 20, 280);

    // Dosyayı kaydet
    doc.save(`geomorphosis-rapor-${Date.now()}.pdf`);
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
            
            {/* Modal Header */}
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

            {/* Modal Body */}
            <div className="p-6 flex-1 overflow-y-auto">
              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-6 space-y-4">
                <div className="flex justify-between border-b border-gray-200 pb-3">
                  <span className="text-gray-500">Bölge:</span>
                  <span className="font-semibold text-gray-800">{data?.region_name || 'Bilinmiyor'}</span>
                </div>
                <div className="flex justify-between border-b border-gray-200 pb-3">
                  <span className="text-gray-500">NDVI Skoru:</span>
                  <span className="font-semibold text-green-600">{data?.ndvi_score || 'N/A'}</span>
                </div>
                <div className="flex justify-between border-b border-gray-200 pb-3">
                  <span className="text-gray-500">Ormansızlaşma Riski:</span>
                  <span className="font-semibold text-orange-600 capitalize">{data?.deforestation_risk || 'N/A'}</span>
                </div>
                <div className="flex justify-between pb-1">
                  <span className="text-gray-500">Kirlilik:</span>
                  <span className="font-semibold text-yellow-600 capitalize">{data?.pollution_level || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-4">
              <button
                onClick={() => setIsPreviewOpen(false)}
                className="flex-1 px-4 py-3 rounded-xl bg-white border border-gray-200 text-gray-700 font-medium hover:bg-gray-100 transition-colors"
              >
                Kapat
              </button>
              <button
                onClick={generatePDF}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-700 transition-colors shadow-lg shadow-primary-500/30"
              >
                <Download size={20} />
                PDF İndir
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}