"""
GeoMorphosis - Otomatik Etiketleme Araci
NDVI/NDWI gorsellerindeki renk kurallarini kullanarak YOLO etiketleri uretir.

Kullanim:
    python labeling.py --dataset deforestation
    python labeling.py --dataset pollution
    python labeling.py --dataset all
    python labeling.py visualize --dataset pollution --region izmit_korfezi --years 2015 2025
    python labeling.py visualize --dataset deforestation --region bursa_uludag --years 2020 2025 --save
"""

import cv2
import numpy as np
import shutil
import sys
import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_RAW = PROJECT_ROOT / "data" / "raw"
DATA_YOLO = PROJECT_ROOT / "data" / "yolo"

CLASS_NAMES = {
    "deforestation": ["deforestation"],
    "pollution": ["pollution"],
}

NDVI_RED_RANGE = [(0, 25), (160, 180)]
NDVI_YELLOW_RANGE = (25, 45)

NDWI_CLEAN_RANGE = (85, 95)
NDWI_POLLUTED_RANGE = (100, 125)


def ndvi_to_yolo_labels(ndvi_img_path, min_area_pixels=300):
    """NDVI gorselindeki dusuk NDVI (kirmizi/sari) alanlarini tespit eder."""
    img = cv2.imread(str(ndvi_img_path))
    if img is None:
        print(f"  Gorsel okunamadi: {ndvi_img_path}")
        return []

    img_h, img_w, _ = img.shape
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    hue = hsv[:, :, 0]
    sat = hsv[:, :, 1]

    mask_red1 = cv2.inRange(hsv, np.array([0, 50, 50]), np.array([25, 255, 255]))
    mask_red2 = cv2.inRange(hsv, np.array([160, 50, 50]), np.array([180, 255, 255]))
    mask_red = cv2.bitwise_or(mask_red1, mask_red2)
    mask_yellow = cv2.inRange(hsv, np.array([25, 50, 50]), np.array([45, 255, 255]))
    mask = cv2.bitwise_or(mask_red, mask_yellow)

    kernel = np.ones((5, 5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    labels = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area_pixels:
            continue

        x, y, w, h = cv2.boundingRect(cnt)
        x_center = (x + w / 2.0) / img_w
        y_center = (y + h / 2.0) / img_h
        norm_w = w / img_w
        norm_h = h / img_h

        labels.append(f"0 {x_center:.6f} {y_center:.6f} {norm_w:.6f} {norm_h:.6f}")

    return labels


def ndwi_to_yolo_labels(ndwi_img_path, min_area_pixels=300):
    """NDWI gorselindeki kirli su (koyu mavi) alanlarini tespit eder."""
    img = cv2.imread(str(ndwi_img_path))
    if img is None:
        print(f"  Gorsel okunamadi: {ndwi_img_path}")
        return []

    img_h, img_w, _ = img.shape
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    hue = hsv[:, :, 0]
    sat = hsv[:, :, 1]
    val = hsv[:, :, 2]

    polluted = (hue >= NDWI_POLLUTED_RANGE[0]) & (hue <= NDWI_POLLUTED_RANGE[1]) & (sat > 100)
    mask = polluted.astype(np.uint8) * 255

    kernel = np.ones((5, 5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    labels = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area_pixels:
            continue

        x, y, w, h = cv2.boundingRect(cnt)
        x_center = (x + w / 2.0) / img_w
        y_center = (y + h / 2.0) / img_h
        norm_w = w / img_w
        norm_h = h / img_h

        labels.append(f"0 {x_center:.6f} {y_center:.6f} {norm_w:.6f} {norm_h:.6f}")

    return labels


def get_label_function(dataset):
    if dataset == "deforestation":
        return ndvi_to_yolo_labels
    return ndwi_to_yolo_labels


def get_source_dir(dataset):
    return DATA_RAW / f"{dataset}_dataset"


def build_yolo_dataset(dataset, min_area_pixels=300):
    """Kaynak dataseti YOLO formatina donusturur."""
    source_root = get_source_dir(dataset)
    if not source_root.exists():
        print(f"Kaynak bulunamadi: {source_root}")
        return

    yolo_dir = DATA_YOLO / dataset
    label_func = get_label_function(dataset)
    class_names = CLASS_NAMES[dataset]

    total_images = 0
    total_labels = 0

    for split in ["train", "test"]:
        split_source = source_root / split
        if not split_source.exists():
            continue

        yolo_split = "val" if split == "test" else split
        images_dir = yolo_dir / "images" / yolo_split
        labels_dir = yolo_dir / "labels" / yolo_split
        images_dir.mkdir(parents=True, exist_ok=True)
        labels_dir.mkdir(parents=True, exist_ok=True)

        for region_dir in sorted(split_source.iterdir()):
            if not region_dir.is_dir():
                continue

            region_name = region_dir.name
            print(f"  {region_name}")

            for img_path in sorted(region_dir.glob("*_ndvi.png")):
                year = img_path.name.replace("_ndvi.png", "")
                rgb_path = region_dir / f"{year}.png"

                if not rgb_path.exists():
                    continue

                unique_name = f"{region_name}_{year}"
                dst_img = images_dir / f"{unique_name}.png"
                dst_label = labels_dir / f"{unique_name}.txt"

                if dataset == "pollution":
                    ndwi_path = region_dir / f"{year}_ndwi.png"
                    source_label = ndwi_path if ndwi_path.exists() else img_path
                else:
                    source_label = img_path

                shutil.copy2(rgb_path, dst_img)

                labels = label_func(source_label, min_area_pixels)
                with open(dst_label, "w") as f:
                    f.write("\n".join(labels))

                total_images += 1
                total_labels += len(labels)

    data_yaml = yolo_dir / "data.yaml"
    with open(data_yaml, "w", encoding="utf-8") as f:
        f.write(f"path: {yolo_dir}\n")
        f.write(f"train: images/train\n")
        f.write(f"val: images/val\n")
        f.write(f"nc: 1\n")
        f.write(f"names: {class_names}\n")

    print(f"\nDataset: {dataset}")
    print(f"Gorsel: {total_images}")
    print(f"Etiket: {total_labels}")
    print(f"Cikis: {yolo_dir}")
    print(f"Yaml: {data_yaml}")


def find_image_files(dataset, region_name):
    """Dataset ve bolgeye gore kaynak dosyalari bulur."""
    source_root = get_source_dir(dataset)
    region_dirs = list(source_root.glob(f"*/{region_name}"))
    if not region_dirs:
        raise FileNotFoundError(f"{dataset} datasetinde '{region_name}' bolgesi bulunamadi")
    return region_dirs[0]


def visualize_labels(dataset, region_name, years, save=False):
    """Belirtilen yillar icin etiketlenen alanlari gorsellestirir."""
    region_dir = find_image_files(dataset, region_name)
    label_func = get_label_function(dataset)

    n = len(years)
    fig, axes = plt.subplots(1, n, figsize=(6 * n, 6))
    if n == 1:
        axes = [axes]

    for i, year in enumerate(years):
        rgb_path = region_dir / f"{year}.png"
        ndvi_path = region_dir / f"{year}_ndvi.png"
        ndwi_path = region_dir / f"{year}_ndwi.png"

        if not rgb_path.exists():
            print(f"  {year} RGB gorseli bulunamadi: {rgb_path}")
            continue

        if dataset == "pollution" and ndwi_path.exists():
            label_img = ndwi_path
        else:
            label_img = ndvi_path

        labels = label_func(label_img, min_area_pixels=300)

        img_bgr = cv2.imread(str(rgb_path))
        ax = axes[i]
        ax.imshow(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB))
        ax.set_title(f"{region_name} - {year}\n{len(labels)} tespit", fontsize=12)
        ax.set_xticks([])
        ax.set_yticks([])

        for label in labels:
            parts = label.split()
            if len(parts) != 5:
                continue
            cls_id = int(parts[0])
            xc, yc, bw, bh = map(float, parts[1:])
            h_img, w_img = img_bgr.shape[:2]

            x = (xc - bw / 2) * w_img
            y = (yc - bh / 2) * h_img
            color = "red" if cls_id == 0 else "yellow"
            rect = mpatches.Rectangle((x, y), bw * w_img, bh * h_img,
                                      linewidth=2, edgecolor=color,
                                      facecolor="none")
            ax.add_patch(rect)

    fig.suptitle(f"{dataset} - {region_name} Etiket Goruntuleme", fontsize=14, y=1.02)

    if save:
        out_dir = PROJECT_ROOT / "data" / "visuals"
        out_dir.mkdir(exist_ok=True)
        out_path = out_dir / f"{dataset}_{region_name}_{'-'.join(map(str, years))}.png"
        fig.savefig(out_path, dpi=150, bbox_inches="tight")
        print(f"Kaydedildi: {out_path}")
    else:
        plt.show()

    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description="YOLO icin otomatik etiketleme")
    subparsers = parser.add_subparsers(dest="command")

    build_parser = subparsers.add_parser("build", help="YOLO dataseti olustur")
    build_parser.add_argument("--dataset", choices=["deforestation", "pollution", "all"], default="all")
    build_parser.add_argument("--min-area", type=int, default=300, help="Minimum piksel alani")

    vis_parser = subparsers.add_parser("visualize", help="Etiketleri gorsellestir")
    vis_parser.add_argument("--dataset", choices=["deforestation", "pollution"], required=True)
    vis_parser.add_argument("--region", required=True, help="Bolge adi (orn: izmit_korfezi)")
    vis_parser.add_argument("--years", nargs="+", type=int, required=True, help="Yillar (orn: 2015 2025)")
    vis_parser.add_argument("--save", action="store_true", help="Gorseli kaydet")

    args = parser.parse_args()

    if args.command == "visualize":
        visualize_labels(args.dataset, args.region, args.years, save=args.save)
        return

    datasets = ["deforestation", "pollution"] if args.dataset == "all" else [args.dataset]

    for ds in datasets:
        print(f"\n=== {ds} ===")
        build_yolo_dataset(ds, args.min_area)


if __name__ == "__main__":
    main()
