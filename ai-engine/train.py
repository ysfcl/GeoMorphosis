"""
GeoMorphosis - Mehmet-yolo Veri Seti ile Fine-Tuning Eğitimi
"""

from ultralytics import YOLO
from pathlib import Path
import shutil

BASE_DIR = Path(__file__).resolve().parent


def start_fine_tuning():
    # 1. Yeni oluşturduğumuz birleşik YAML yolunu belirtiyoruz
    yaml_path = BASE_DIR / "Mehmet-yolo" / "data_combined.yaml"

    # 2. Önceki eğitimden elde ettiğimiz model ağırlığı
    previous_model_path = BASE_DIR / "models" / "fire_yolov8.pt"

    if not previous_model_path.exists():
        print(f"[!] Hata: {previous_model_path} bulunamadı!")
        return

    if not yaml_path.exists():
        print(f"[!] Hata: {yaml_path} bulunamadı! Yolu kontrol edin.")
        return

    print(f"[+] Önceki model yükleniyor: {previous_model_path}")
    model = YOLO(str(previous_model_path))

    print(f"[+] {yaml_path} üzerinden fine-tuning başlatılıyor...")

    # 3. Eğitimi başlat
    results = model.train(
        data=str(yaml_path),
        epochs=20,  # Fine-tuning için 15-20 epoch yeterlidir
        imgsz=640,
        batch=16,
        device=0,  # GPU kullanımı için 0 (CPU için "cpu")
        name="geomorphosis_mehmet_run",
    )

    # 4. En iyi model ağırlığını kopyala
    best_weights = (
        BASE_DIR
        / "runs"
        / "detect"
        / "geomorphosis_mehmet_run"
        / "weights"
        / "best.pt"
    )
    target_weights = BASE_DIR / "models" / "fire_yolov8_v2.pt"

    if best_weights.exists():
        shutil.copy(best_weights, target_weights)
        print(
            f"\n[✔] Eğitim tamamlandı! Yeni model kaydedildi: {target_weights}"
        )


if __name__ == "__main__":
    start_fine_tuning()