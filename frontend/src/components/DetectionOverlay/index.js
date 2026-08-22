'use client';

// analysis_service sinif adlarini ASCII kucuk harf uretiyor (yolo_service.class_name)
const CLASS_STYLES = {
  deforestation: { box: 'border-orange-600', label: 'bg-orange-600', text: 'Ormansızlaşma' },
  pollution: { box: 'border-yellow-400', label: 'bg-yellow-400', text: 'Kirlilik' },
};

const FALLBACK_STYLE = { box: 'border-blue-400', label: 'bg-blue-400', text: null };

/**
 * YOLO tespitlerini goruntunun uzerine kutu olarak cizer.
 *
 * bbox degerleri modelin girdi olcusundeki (varsayilan 512x512) piksel
 * koordinatlari. Yuzdeye cevirdigimiz icin goruntu responsive kuculurken
 * kutular hizada kaliyor.
 */
export default function DetectionOverlay({ detections, size = 512 }) {
  if (!Array.isArray(detections) || detections.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none">
      {detections.map((detection, index) => {
        const bbox = detection?.bbox;
        if (!Array.isArray(bbox) || bbox.length < 4) return null;

        const [x1, y1, x2, y2] = bbox;
        const width = ((x2 - x1) / size) * 100;
        const height = ((y2 - y1) / size) * 100;

        // Bozuk veya sifir alanli kutu cizme
        if (!(width > 0) || !(height > 0)) return null;

        const className = String(detection.class ?? '').toLowerCase();
        const style = CLASS_STYLES[className] ?? FALLBACK_STYLE;
        const confidence = Math.round((Number(detection.confidence) || 0) * 100);

        return (
          <div
            key={`${className}-${index}`}
            className={`absolute border-2 rounded-sm ${style.box}`}
            style={{
              left: `${(x1 / size) * 100}%`,
              top: `${(y1 / size) * 100}%`,
              width: `${width}%`,
              height: `${height}%`,
            }}
          >
            <span
              className={`absolute -top-6 left-0 px-2 py-0.5 rounded text-xs font-bold text-white whitespace-nowrap ${style.label}`}
            >
              {style.text ?? className} %{confidence}
            </span>
          </div>
        );
      })}
    </div>
  );
}
