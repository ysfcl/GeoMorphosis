"""
GeoMorphosis - YOLOv8 Dataset Hazırlayıcı ve Klasörleyici
data/raw/ altındaki indirilen resimleri YOLOv8 formatına (train/val) otomatik böler.

Kullanım:
    python utils/prepare_yolo_dataset.py --region bursa
    python utils/prepare_yolo_dataset.py --region marmaris
"""

import os
import shutil
import random
import yaml
from pathlib import Path

# Dizin Yolları
BASE_DIR = Path(__file__).resolve().parent.parent.parent
RAW_DATA_DIR = BASE_DIR / "data" / "raw"
YOLO_DATASET_DIR = BASE_DIR / "ai-engine" / "dataset"

CLASSES = ["fire", "pollution"]  # Model sınıflarımız


def setup_yolo_folders(output_dir):
    """YOLOv8 için gerekli klasör yapısını oluşturur."""
    for split in ["train", "val"]:
        for folder in ["images", "labels"]:
            (output_dir / split / folder).mkdir(parents=True, exist_ok=True)


def create_data_yaml(output_dir):
    """YOLOv8 eğitimi için gerekli data.yaml dosyasını oluşturur."""
    yaml_content = {
        "path": str(output_dir.resolve()),
        "train": "train/images",
        "val": "val/images",
        "nc": len(CLASSES),
        "names": CLASSES,
    }

    yaml_path = output_dir / "data.yaml"
    with open(yaml_path, "w", encoding="utf-8") as f:
        yaml.dump(yaml_content, f, default_flow_style=False)

    print(f"[+] 'data.yaml' oluşturuldu: {yaml_path}")


def prepare_dataset(region_name="bursa", train_ratio=0.8, seed=42):
    random.seed(seed)
    region_dir = RAW_DATA_DIR / region_name.lower()

    if not region_dir.exists():
        print(f"[!] Hata: '{region_dir}' dizini bulunamadı! Önce veri toplayıcıyı çalıştırın.")
        return

    # Tüm indirilmiş PNG görsellerini topla
    all_images = list(region_dir.rglob("*.png"))
    
    # Sadece tile/kare görsellerini filtrele (ndvi veya ana haritalar hariç)
    tile_images = [img for img in all_images if "tile" in img.name or "dataset_tiles" in str(img)]

    if not tile_images:
        print(f"[!] '{region_name}' klasöründe işlenecek karo (tile) resmi bulunamadı.")
        return

    print(f"\n{'='*60}")
    print(f"Toplam Bulunan Görsel Sayısı ({region_name}): {len(tile_images)}")
    print(f"Eğitim Oranı: %{int(train_ratio*100)} | Doğrulama Oranı: %{int((1-train_ratio)*100)}")
    print(f"{'='*60}")

    # Görselleri Karıştır ve Böl
    random.shuffle(tile_images)
    split_index = int(len(tile_images) * train_ratio)
    
    train_images = tile_images[:split_index]
    val_images = tile_images[split_index:]

    # Klasör yapısını kur
    setup_yolo_folders(YOLO_DATASET_DIR)

    # Resimleri kopyala
    def copy_files(image_list, split_type):
        copied_count = 0
        for img_path in image_list:
            dest_img = YOLO_DATASET_DIR / split_type / "images" / img_path.name
            shutil.copy(img_path, dest_img)
            copied_count += 1
        return copied_count

    train_copied = copy_files(train_images, "train")
    val_copied = copy_files(val_images, "val")

    # data.yaml dosyasını oluştur
    create_data_yaml(YOLO_DATASET_DIR)

    print(f"\n[+] Başarıyla Tamamlandı!")
    print(f"    - Train Görselleri: {train_copied} adet -> {YOLO_DATASET_DIR / 'train' / 'images'}")
    print(f"    - Val Görselleri  : {val_copied} adet -> {YOLO_DATASET_DIR / 'val' / 'images'}")
    print(f"\nŞimdi 'ai-engine/dataset' klasörünü doğrudan Roboflow veya CVAT'a yükleyip etiketleyebilirsin.")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="İndirilen Verileri YOLOv8 Klasör Formatına Dönüştürücü")
    parser.add_argument("--region", default="bursa", help="Dönüştürülecek bölge adı (bursa, marmaris vb.)")
    parser.add_argument("--ratio", type=float, default=0.8, help="Train veri oranı (Varsayılan: 0.8)")

    args = parser.parse_args()

    prepare_dataset(region_name=args.region, train_ratio=args.ratio)