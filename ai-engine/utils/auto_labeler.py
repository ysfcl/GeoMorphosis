"""
GeoMorphosis - Yerel Otomatik YOLO Etiketleyici
YOLOv8 Pretrained model kullanarak 'ai-engine/dataset' altındaki tüm görselleri etiketler.
"""

from ultralytics import YOLO
from pathlib import Path

# Dizin Yolları
UTILS_DIR = Path(__file__).resolve().parent
AI_ENGINE_DIR = UTILS_DIR.parent
DATASET_DIR = AI_ENGINE_DIR / "dataset"

# Pretrained YOLOv8 Nano Modelini Yükle
model = YOLO("yolov8n.pt") 

def run_auto_label():
    # Dataset içindeki tüm PNG/JPG görsellerini tara
    image_paths = list(DATASET_DIR.rglob("*.png")) + list(DATASET_DIR.rglob("*.jpg"))
    print(f"[+] Toplam {len(image_paths)} adet görsel taranıyor ve etiketleniyor...")

    count = 0
    for img_path in image_paths:
        # Sadece 'images' klasöründeki ham görselleri işle
        if "images" not in str(img_path):
            continue

        # Model tahmini (Eşik değeri conf=0.25)
        results = model.predict(source=str(img_path), conf=0.25, verbose=False)
        
        # Etiketlerin kaydedileceği hedef klasör: 'images' -> 'labels'
        label_dir = Path(str(img_path.parent).replace("images", "labels"))
        label_dir.mkdir(parents=True, exist_ok=True)
        txt_path = label_dir / f"{img_path.stem}.txt"

        lines = []
        for result in results:
            for box in result.boxes:
                cls_id = int(box.cls[0])
                # Normalleştirilmiş Bounding Box koordinatları (x_center, y_center, width, height)
                x, y, w, h = box.xywhn[0].tolist()
                lines.append(f"{cls_id} {x:.6f} {y:.6f} {w:.6f} {h:.6f}")

        # Nesne bulunduysa veya boş etiket dosyası gerektiğinde .txt yaz
        with open(txt_path, "w", encoding="utf-8") as f:
            if lines:
                f.write("\n".join(lines))
        count += 1

    print(f"\n[✔] Etiketleme Tamamlandı!")
    print(f"    - Toplam İşlenen Görsel ve Oluşturulan Etiket Dosyası: {count} adet")
    print(f"    - Etiket Konumları: {DATASET_DIR / 'train' / 'labels'} & {DATASET_DIR / 'val' / 'labels'}")

if __name__ == "__main__":
    run_auto_label()