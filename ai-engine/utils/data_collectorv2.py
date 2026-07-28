"""
GeoMorphosis - Marmara Bolgesi Veri Seti Toplayici (v2)
GEE uzerinden ormansizlastirma ve cevre kirirliligi veri setleri olusturur.

Kullanim:
    python data_collectorv2.py --type deforestation
    python data_collectorv2.py --type pollution
    python data_collectorv2.py --type all
    python data_collectorv2.py --type deforestation --location istanbul_kuzey
    python data_collectorv2.py --type pollution --years 2015 2020 2025
    python data_collectorv2.py --list
"""

import os
import sys
import json
import requests
import argparse
from pathlib import Path
from datetime import datetime

# GEE modulunu bul icin yol ayari
sys.path.insert(0, str(Path(__file__).resolve().parent))
from gee_utils import init_gee, get_satellite_composite

OUTPUT_BASE = Path(__file__).resolve().parent.parent.parent / "data" / "raw"

MARMARA_HOTSPOTS = {
    # ORMANSIZLASTIRMA VERI SETI
    "istanbul_kuzey": {
        "dataset": "deforestation_dataset",
        "split": "train",
        "center": [41.2215, 28.9248],
        "description": "Kuzey ormanlari yapilanma ve agac kaybi",
    },
    "bursa_uludag": {
        "dataset": "deforestation_dataset",
        "split": "train",
        "center": [40.1205, 29.1310],
        "description": "Orman tahribati ve madencilik",
    },
    "canakkale_kazdaglari": {
        "dataset": "deforestation_dataset",
        "split": "test",
        "center": [39.7120, 26.8250],
        "description": "Kazdaglari orman ortusu degisimi",
    },
    # CEVRE KIRLILIGI VERI SETI
    "ergene_havzasi": {
        "dataset": "pollution_dataset",
        "split": "train",
        "center": [41.2780, 27.8120],
        "description": "Ergene nehir ve toprak kirliligi",
    },
    "izmit_korfezi": {
        "dataset": "pollution_dataset",
        "split": "train",
        "center": [40.7600, 29.5400],
        "description": "Agir sanayi ve kiyi kirliligi",
    },
    "gemlik_korfezi": {
        "dataset": "pollution_dataset",
        "split": "test",
        "center": [40.4210, 29.1200],
        "description": "Deniz renk degisimi ve musilaj kirliligi",
    },
}

DEFAULT_YEARS = list(range(2010, 2026))
TILE_SIZE = "512x512"


def download_tile(composite, roi, save_path, bands, min_val=0.0, max_val=0.3, palette=None):
    """GEE Thumbnail servisi uzerinden RGB veya Renklendirilmis NDVI/NDWI indirir."""
    vis_params = {
        "bands": bands,
        "min": min_val,
        "max": max_val,
        "region": roi,
        "dimensions": TILE_SIZE,
        "format": "png",
    }
    if palette:
        vis_params["palette"] = palette

    url = composite.getThumbURL(vis_params)
    response = requests.get(url, timeout=120)
    response.raise_for_status()

    with open(save_path, "wb") as f:
        f.write(response.content)

    return len(response.content)


def get_rgb_bands(year):
    """Yıla gore RGB bant isimlerini dondurur."""
    if year >= 2015:
        return ["B4", "B3", "B2"]
    elif year >= 2013:
        return ["SR_B4", "SR_B3", "SR_B2"]
    else:
        return ["SR_B3", "SR_B2", "SR_B1"]


def generate_dataset(dataset_type=None, location_filter=None, years=None):
    """
    Marmara Bolgesi veri setlerini olusturur.

    Args:
        dataset_type: "deforestation_dataset", "pollution_dataset" veya None (hepsi)
        location_filter: Belirli bir lokasyon anahtari veya None (hepsi)
        years: Yil listesi veya None (varsayilan 2010-2025)
    """
    if years is None:
        years = DEFAULT_YEARS

    init_gee()

    ndvi_palette = ["#d7191c", "#fdae61", "#ffffbf", "#a6d96a", "#1a9641"]
    ndwi_palette = ["#0000ff", "#00ffff", "#ffffff", "#ff0000", "#800000"]

    filtered = {}
    for key, info in MARMARA_HOTSPOTS.items():
        if dataset_type and info["dataset"] != dataset_type:
            continue
        if location_filter and key not in location_filter:
            continue
        filtered[key] = info

    if not filtered:
        print("Hicbir lokasyon filtreleme kosuluna uymadi.")
        return

    total_ok = 0
    total_fail = 0
    metadata_all = {}

    for location_key, info in filtered.items():
        dataset_name = info["dataset"]
        split_type = info["split"]
        lat, lon = info["center"]

        target_dir = OUTPUT_BASE / dataset_name / split_type / location_key
        target_dir.mkdir(parents=True, exist_ok=True)

        print(f"\n{'='*55}")
        print(f"  Lokasyon : {location_key}")
        print(f"  Veri Seti: {dataset_name} ({split_type})")
        print(f"  Merkez   : {lat}, {lon}")
        print(f"  Aciklama : {info['description']}")
        print(f"  Cikis    : {target_dir}")
        print(f"{'='*55}")

        metadata = {
            "location": location_key,
            "dataset": dataset_name,
            "split": split_type,
            "center": [lat, lon],
            "description": info["description"],
            "years": years,
            "tile_size": TILE_SIZE,
            "created": datetime.now().isoformat(),
            "images": [],
        }

        for year in years:
            rgb_path = target_dir / f"{year}.png"
            ndvi_path = target_dir / f"{year}_ndvi.png"

            is_pollution = dataset_name == "pollution_dataset"
            ndwi_path = target_dir / f"{year}_ndwi.png" if is_pollution else None

            try:
                composite, roi = get_satellite_composite(lat, lon, year)

                rgb_bands = get_rgb_bands(year)
                size = download_tile(composite, roi, str(rgb_path), bands=rgb_bands)

                download_tile(
                    composite, roi, str(ndvi_path),
                    bands=["NDVI"],
                    min_val=-0.1, max_val=0.8,
                    palette=ndvi_palette,
                )

                if is_pollution and ndwi_path:
                    download_tile(
                        composite, roi, str(ndwi_path),
                        bands=["NDWI"],
                        min_val=-0.5, max_val=0.5,
                        palette=ndwi_palette,
                    )

                img_entry = {
                    "year": year,
                    "rgb": f"{year}.png",
                    "ndvi": f"{year}_ndvi.png",
                    "size_bytes": size,
                }
                if is_pollution:
                    img_entry["ndwi"] = f"{year}_ndwi.png"

                metadata["images"].append(img_entry)
                total_ok += 1

                extra = f" + NDWI" if is_pollution else ""
                print(f"  [OK]  {year} -> {year}.png, {year}_ndvi.png{extra}")

            except Exception as e:
                total_fail += 1
                print(f"  [HATA] {year}: {e}")

        meta_path = target_dir / "metadata.json"
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)

        metadata_all[location_key] = metadata

    summary_path = OUTPUT_BASE / f"{'all' if not dataset_type else dataset_type}_summary.json"
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump({
            "generated_at": datetime.now().isoformat(),
            "dataset_type": dataset_type or "all",
            "total_ok": total_ok,
            "total_fail": total_fail,
            "locations": metadata_all,
        }, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*55}")
    print(f"  TAMAMLANDI")
    print(f"  Basarili: {total_ok} | Basarisiz: {total_fail}")
    print(f"  Ozet: {summary_path}")
    print(f"{'='*55}")


def list_locations():
    print(f"\n{'='*55}")
    print("  MEVCUT LOKASYONLAR")
    print(f"{'='*55}")
    for key, info in MARMARA_HOTSPOTS.items():
        print(f"\n  {key}")
    print(f"\n{'='*55}")


def main():
    parser = argparse.ArgumentParser(
        description="GeoMorphosis - Marmara Bolgesi Veri Seti Olusturucu",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ornekler:
  python data_collectorv2.py --list
  python data_collectorv2.py --type deforestation
  python data_collectorv2.py --type pollution --location ergene_havzasi
  python data_collectorv2.py --type all --years 2020 2022 2024
        """,
    )

    parser.add_argument(
        "--type", "-t",
        choices=["deforestation_dataset", "pollution_dataset", "all"],
        default="all",
        help="Veri seti turu (varsayilan: all)",
    )
    parser.add_argument(
        "--location", "-l",
        nargs="+",
        help="Belirli lokasyon(lar) (boslukla ayirarak birden fazla)",
    )
    parser.add_argument(
        "--years", "-y",
        nargs="+",
        type=int,
        default=None,
        help="Yil araligi (orn: --years 2015 2020 2025)",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="Mevcut tum lokasyonlari listele",
    )

    args = parser.parse_args()

    if args.list:
        list_locations()
        return

    dataset_type = args.type if args.type != "all" else None

    print("\n* GeoMorphosis Veri Seti Olusturucu v2")
    print(f"* Tur: {args.type}")
    print(f"* Yillar: {args.years or DEFAULT_YEARS}")
    if args.location:
        print(f"* Lokasyonlar: {', '.join(args.location)}")

    generate_dataset(
        dataset_type=dataset_type,
        location_filter=args.location,
        years=args.years,
    )


if __name__ == "__main__":
    main()
