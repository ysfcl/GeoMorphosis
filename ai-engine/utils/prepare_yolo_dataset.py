"""
GeoMorphosis - Tüm Bölgeleri YOLOv8 Formatına Dönüştürücü
4 bölgedeki (bursa, marmaris, manavgat, eskisehir) resimleri toplayıp %80 Train / %20 Val olarak ayırır.
"""

import os
import shutil
import random
import yaml
from pathlib import Path

# ai-engine/utils/ altından proje kök dizinini ve veri yollarını tespit etme
UTILS_DIR = Path(__file__).resolve().parent
AI_ENGINE_DIR = UTILS_DIR.parent
PROJECT_ROOT = AI_ENGINE_DIR.parent

RAW_DATA_DIR = AI_ENGINE_DIR / "data" / "raw"
YOLO_DATASET_DIR = AI_ENGINE_DIR / "dataset"

REGIONS = ["bursa", "marmaris", "manavgat", "eskisehir"]
CLASSES = ["fire", "pollution"]


def build_combined_dataset(train_ratio=0.8, seed=42):
    random.seed(seed)
    all_tiles = []

    # 4 bölgenin altındaki tüm PNG karolarını topla
    for region in REGIONS:
        region_dir = RAW_DATA_DIR / region
        if region_dir.exists():
            tiles = [img for img in region_dir.rglob("*.png") if "tile" in img.name or "dataset_tiles" in str(img)]
            all_tiles.extend(tiles)
            print(f"[+] {region.capitalize()}: {len(tiles)} adet karo bulundu.")
        else:
            print(f"[!] Uyarı: '{region_dir}' klasörü bulunamadı, atlanıyor.")

    if not all_tiles:
        print("[!] Hiçbir karo görseli bulunamadı. Lütfen klasör yollarını kontrol edin.")
        return

    print(f"\n[+] Toplam İşlenecek Görsel Sayısı: {len(all_tiles)}")

    # Hedef YOLO Klasör Yapısını Temiz/Hazır Hale Getir
    for split in ["train", "val"]:
        for folder in ["images", "labels"]:
            (YOLO_DATASET_DIR / split / folder).mkdir(parents=True, exist_ok=True)

    # Karıştır ve Böl
    random.shuffle(all_tiles)
    split_idx = int(len(all_tiles) * train_ratio)

    train_files = all_tiles[:split_idx]
    val_files = all_tiles[split_idx:]

    # Dosyaları Kopyala
    print("[+] Görseller 'ai-engine/dataset' klasörüne aktarılıyor...")
    for img_path in train_files:
        shutil.copy(img_path, YOLO_DATASET_DIR / "train" / "images" / img_path.name)

    for img_path in val_files:
        shutil.copy(img_path, YOLO_DATASET_DIR / "val" / "images" / img_path.name)

    # data.yaml Yapılandırmasını Oluştur
    yaml_content = {
        "path": str(YOLO_DATASET_DIR.resolve()),
        "train": "train/images",
        "val": "val/images",
        "nc": len(CLASSES),
        "names": CLASSES,
    }

    yaml_file_path = YOLO_DATASET_DIR / "data.yaml"
    with open(yaml_file_path, "w", encoding="utf-8") as f:
        yaml.dump(yaml_content, f, default_flow_style=False)

    print(f"\n[✔] İşlem Başarıyla Tamamlandı!")
    print(f"    - Train Görselleri : {len(train_files)} adet -> {YOLO_DATASET_DIR / 'train' / 'images'}")
    print(f"    - Val Görselleri   : {len(val_files)} adet -> {YOLO_DATASET_DIR / 'val' / 'images'}")
    print(f"    - Yapılandırma     : {yaml_file_path}")


if __name__ == "__main__":
    build_combined_dataset()