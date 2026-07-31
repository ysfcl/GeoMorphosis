"""
GeoMorphosis - Egitim Veri Seti Toplayici (YOLOv8 Uyumlu)
GEE ile Sentinel-2 goruntulerini indirir, Genis Bolgeyi Grid'lere bolerek indirir.

Kullanim:
    python utils/data_collector.py --region manavgat --years 2021 2022 2023 2024 2025
    python utils/data_collector.py --region marmaris --years 2021 2022 2023 2024 2025
"""

import ee
import os
import json
import requests
from pathlib import Path
from datetime import datetime

OUTPUT_BASE = Path(__file__).resolve().parent.parent.parent / "data" / "raw"

REGIONS = {
    "bursa": {
        "name": "Bursa",
        # BBOX: [Batı Boylam, Güney Enlem, Doğu Boylam, Kuzey Enlem]
        "bbox": [28.60, 39.90, 29.30, 40.40],
        "description": "Bursa Genis Alan (Uludag, Sehir Merkezi, Nilufer, Tarim)",
    },
    "ankara": {
        "name": "Ankara",
        "bbox": [32.60, 39.80, 33.00, 40.10],
        "description": "Ankara Genis Alan",
    },
    "marmaris": {
        "name": "Marmaris",
        "bbox": [28.00, 36.65, 28.60, 37.10],
        "description": "Marmaris Orman ve Yangın Bölgesi",
    },
    "manavgat": {
        "name": "Manavgat",
        "bbox": [31.25, 36.65, 31.75, 37.15],
        "description": "Manavgat Orman Yangını ve Su Kaynakları Bölgesi",
    }
}

DEFAULT_YEARS = [2021, 2022, 2023, 2024, 2025]
CLOUD_THRESHOLD = 15
TILE_DIMENSION = 640  # YOLOv8 varsayilan girdi boyutu (640x640)

KEY_PATH = Path(__file__).resolve().parent.parent / "gee-key.json"


def init_gee():
    try:
        if KEY_PATH.exists():
            # Service Account anahtarı ile yetkilendirme
            credentials = ee.ServiceAccountCredentials(
                "geomorphosis@geomorphosis.iam.gserviceaccount.com",
                str(KEY_PATH)
            )
            ee.Initialize(credentials, project="geomorphosis")
            print("GEE Service Account ile basariyla baslatildi (Project: geomorphosis).")
        else:
            # Yedek varsayılan başlatma
            ee.Initialize(project="geomorphosis")
            print("GEE varsayilan modda baslatildi.")
    except Exception as e:
        print(f"GEE Baslatilamadi: {e}")
        raise e


def mask_clouds(image):
    qa = image.select("QA60")
    cloud_mask = qa.bitwiseAnd(1 << 10).eq(0)
    cirrus_mask = qa.bitwiseAnd(1 << 11).eq(0)
    return image.updateMask(cloud_mask.And(cirrus_mask)).divide(10000)


def generate_grid(bbox, grid_size_deg=0.045):
    """
    Genis BBOX alanini kucuk karelere (Grid) boler.
    grid_size_deg=0.045 ayari ile yillik toplam ~500 gorsel indirilecek sekilde ayarlanmistir.
    """
    min_lon, min_lat, max_lon, max_lat = bbox
    grids = []
    
    curr_lat = min_lat
    grid_id = 0
    while curr_lat < max_lat:
        curr_lon = min_lon
        while curr_lon < max_lon:
            grid_box = ee.Geometry.Rectangle([
                curr_lon, 
                curr_lat, 
                min(curr_lon + grid_size_deg, max_lon), 
                min(curr_lat + grid_size_deg, max_lat)
            ])
            grids.append((f"tile_{grid_id}", grid_box))
            grid_id += 1
            curr_lon += grid_size_deg
        curr_lat += grid_size_deg
        
    return grids


def download_tile(composite, roi, file_path):
    vis_params = {
        "bands": ["B4", "B3", "B2"],
        "min": 0,
        "max": 0.3,
        "region": roi,
        "dimensions": f"{TILE_DIMENSION}x{TILE_DIMENSION}",
        "format": "png",
    }

    try:
        url = composite.getThumbURL(vis_params)
        response = requests.get(url, timeout=120)
        response.raise_for_status()

        with open(file_path, "wb") as f:
            f.write(response.content)

        return len(response.content)
    except Exception as e:
        print(f"    Gorsel indirme hatasi: {e}")
        return 0


def collect_region_dataset(region_name="manavgat", years=None):
    init_gee()

    if years is None:
        years = DEFAULT_YEARS

    region = REGIONS.get(region_name, REGIONS["manavgat"])
    region_dir = OUTPUT_BASE / region["name"].lower()
    region_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*60}")
    print(f"Bolge: {region['name']}")
    print(f"Yillar: {years}")
    print(f"Hedef Dizin: {region_dir}")
    print(f"{'='*60}")

    # Genis alani karelere boluyoruz
    grids = generate_grid(region["bbox"])
    print(f"Bölge için oluşturulan Grid (Tile) Kare Sayısı: {len(grids)}")

    # Yıllık ~500 görsel hedeflendiği için 4 farklı ay (4 x ~125 = ~500 tile/yıl)
    monthly_periods = [
        ("06-01", "06-30", "jun"),
        ("07-01", "07-31", "jul"),
        ("08-01", "08-31", "aug"),
        ("09-01", "09-30", "sep")
    ]

    for year in years:
        year_dir = region_dir / str(year)
        year_dir.mkdir(exist_ok=True)
        images_dir = year_dir / "dataset_tiles"
        images_dir.mkdir(exist_ok=True)

        print(f"\n--- {year} Yili Verileri Toplaniyor ---")

        for start_day, end_day, month_tag in monthly_periods:
            start_date = f"{year}-{start_day}"
            end_date = f"{year}-{end_day}"

            collection = (
                ee.ImageCollection("COPERNICUS/S2_HARMONIZED")
                .filterDate(start_date, end_date)
                .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", CLOUD_THRESHOLD))
            )

            if collection.size().getInfo() == 0:
                continue

            composite = collection.map(mask_clouds).median()

            for tile_name, roi_geometry in grids:
                tile_composite = composite.clip(roi_geometry)
                file_path = images_dir / f"{region_name}_{year}_{month_tag}_{tile_name}.png"

                if file_path.exists():
                    print(f"  {file_path.name} zaten mevcut, atlanıyor.")
                    continue

                size = download_tile(tile_composite, roi_geometry, str(file_path))
                if size > 0:
                    print(f"  [+] {file_path.name} indirildi ({size} bytes)")

    print(f"\nVeri toplama tamamlandi! Tum kareler {region_dir} altina kaydedildi.")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="GEE Veri Toplayıcı")
    parser.add_argument("--region", default="manavgat", choices=list(REGIONS.keys()))
    parser.add_argument("--years", nargs="+", type=int, default=[2021, 2022, 2023, 2024, 2025])
    
    args = parser.parse_args()
    collect_region_dataset(args.region, args.years)