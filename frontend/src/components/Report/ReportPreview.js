"use client";

import React, { useRef } from 'react';

export default function ReportPreview() {
  // PDF'e dönüştürülecek HTML alanını işaretlemek için useRef kullanıyoruz
  const reportRef = useRef();

  const handleDownloadPdf = async () => {
    // Next.js'de sunucu tarafında hata almamak için paketi sadece tıklandığında çağırıyoruz
    const html2pdf = (await import('html2pdf.js')).default;
    
    const element = reportRef.current;
    
    // PDF'in kalite ve format ayarları
    const opt = {
      margin:       10,
      filename:     'GeoMorphosis_Rapor.pdf',
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // Belirlediğimiz elementi PDF'e çevir ve indir
    html2pdf().set(opt).from(element).save();
  };

  return (
    <div className="flex flex-col items-center gap-6 my-8 p-4">
      
      {/* PDF İndirme Butonu */}
      <button 
        onClick={handleDownloadPdf}
        className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg shadow-md transition-colors"
      >
        📄 PDF Olarak İndir
      </button>

      {/* Önizleme Alanı (Sadece bu div'in içi PDF'e dönüşecek) */}
      <div 
        ref={reportRef} 
        className="w-full max-w-3xl bg-white p-10 border border-gray-300 shadow-lg text-gray-800 rounded-sm"
      >
        <div className="border-b-2 border-gray-800 pb-4 mb-6">
          <h2 className="text-3xl font-bold uppercase tracking-wider">Saha Analiz Raporu</h2>
          <p className="text-sm text-gray-500 mt-2">GeoMorphosis Çevresel Monitör Sistemi</p>
        </div>
        
        <div className="mb-6">
          <p className="mb-1"><strong>Tarih:</strong> 29 Temmuz 2026</p>
          <p className="mb-1"><strong>Raporlayan:</strong> Sistem Yöneticisi</p>
          <p className="mb-1"><strong>Durum:</strong> Rutin Kontrol</p>
        </div>
        
        <div className="p-4 bg-gray-50 border-l-4 border-blue-500 rounded-r-md">
          <h3 className="font-bold mb-2">Özet Değerlendirme</h3>
          <p className="text-sm leading-relaxed">
            Bu rapor, harita üzerinden seçilen hedef poligon alanındaki coğrafi ve çevresel verilerin 
            anlık analizini içermektedir. Belirtilen koordinatlarda herhangi bir kritik erken uyarı 
            tespit edilmemiştir. Risk seviyesi an itibarıyla <strong>NORMAL</strong> olarak değerlendirilmektedir.
          </p>
        </div>
        
        <div className="mt-8 text-center text-xs text-gray-400">
          <p>Bu belge GeoMorphosis sistemi tarafından otomatik olarak üretilmiştir.</p>
        </div>
      </div>

    </div>
  );
}