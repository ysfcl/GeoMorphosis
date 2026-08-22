from datetime import datetime, timezone
from typing import Any

from services.change_detection_service import ChangeDetectionService
from services.change_map_service import render_ndvi_change_map
from services.ndvi_service import NdviService
from services.satellite_api import (
    THUMB_SIZE,
    change_map_path,
    download_satellite_series,
)
from services.yolo_service import YoloService

# Frontend Analytics bileseni tam olarak bu anahtarlari bekliyor
# (frontend/src/components/Analytics/index.js RISK_LABELS / RISK_WIDTH / RISK_COLOR).
# Turkce karakter veya buyuk harf kullanilmamali.
RISK_LEVELS = ["yok", "dusuk", "orta", "yuksek"]


def _severity_for_deforestation(loss_percentage: float) -> str:
    if loss_percentage > 20:
        return "CRITICAL"
    if loss_percentage > 10:
        return "HIGH"
    return "LOW"


def _severity_for_lake_shrinkage(shrinkage_percentage: float) -> str:
    return "HIGH" if shrinkage_percentage > 5 else "NORMAL"


def _risk_from_detections(detections: list[dict[str, Any]], class_name: str) -> str:
    """YOLO tespitlerini frontend'in bekledigi risk seviyesine cevirir.

    Guven skoru seviyeyi belirler, ayni siniftan cok sayida tespit varsa
    seviye bir kademe yukseltilir.
    """
    matches = [
        d
        for d in detections
        if str(d.get("class", "")).lower() == class_name
    ]

    if not matches:
        return "yok"

    top_confidence = max(float(d.get("confidence", 0.0)) for d in matches)

    if top_confidence >= 0.7:
        index = 3
    elif top_confidence >= 0.4:
        index = 2
    else:
        index = 1

    if len(matches) >= 3:
        index = min(index + 1, 3)

    return RISK_LEVELS[index]


def _risk_from_vegetation_loss(deforestation: dict[str, Any]) -> str:
    """Bitki ortusu kaybini yangin riski sinyaline cevirir.

    Model agirligi yoksa veya nesne tespiti bos donerse NDVI dususu tek
    gostergemiz oluyor.
    """
    if not deforestation.get("detected"):
        return "yok"

    severity = deforestation.get("severity", "LOW")
    if severity == "CRITICAL":
        return "yuksek"
    if severity == "HIGH":
        return "orta"
    return "dusuk"


def _max_risk(*levels: str) -> str:
    return RISK_LEVELS[max(RISK_LEVELS.index(level) for level in levels)]


def _safe_ndvi(path: str):
    """NDVI hesaplamasi tek bir bozuk dosya yuzunden tum analizi cokertmemeli."""
    try:
        return NdviService.calculate_ndvi(path)
    except Exception as e:
        print(f"NDVI hesaplanamadi ({path}): {e}")
        return None


def analyze_region(
    lat: float,
    lon: float,
    buffer_meters: int = 1000,
    years: list[int] | None = None,
    region_name: str | None = None,
) -> dict[str, Any]:
    results = download_satellite_series(
        lat=lat,
        lon=lon,
        buffer_meters=buffer_meters,
        years=years,
    )

    downloaded = [
        r
        for r in results
        if r["status"] == "ok" and r.get("rgb_path") and r.get("ndvi_path")
    ]
    demo_mode = any(r["status"] == "demo" for r in results)

    detections: list[dict[str, Any]] = []
    model_loaded = False
    change_map: dict[str, Any] | None = None
    ndvi_t1_mean = 0.0
    ndvi_t2_mean = 0.0
    ndvi_change = 0.0
    def_res = {"detected": False, "loss_percentage": 0.0}
    water_res = {"detected": False, "shrinkage_percentage": 0.0}

    if downloaded:
        latest_rgb_path = downloaded[-1]["rgb_path"]

        yolo_raw = YoloService.predict(latest_rgb_path)
        model_loaded = bool(yolo_raw.get("model_loaded"))

        for box in yolo_raw.get("boxes", []):
            detections.append(
                {
                    "class": box.get("class", "unknown"),
                    "class_id": box.get("class_id", -1),
                    "confidence": round(float(box.get("confidence", 0.0)), 2),
                    "bbox": box.get("bbox", [0.0, 0.0, 0.0, 0.0]),
                }
            )

        # Tek goruntu olsa bile guncel NDVI ortalamasini hesapliyoruz;
        # karsilastirma (change detection) icin en az iki yil gerekiyor.
        ndvi_t2 = _safe_ndvi(downloaded[-1]["ndvi_path"])
        if ndvi_t2 is not None:
            ndvi_t2_mean = round(float(ndvi_t2.mean()), 2)

        if len(downloaded) >= 2 and ndvi_t2 is not None:
            ndvi_t1 = _safe_ndvi(downloaded[0]["ndvi_path"])

            if ndvi_t1 is not None:
                ndvi_t1_mean = round(float(ndvi_t1.mean()), 2)
                ndvi_change = round(ndvi_t2_mean - ndvi_t1_mean, 2)

                def_res = ChangeDetectionService.detect_vegetation_loss(ndvi_t1, ndvi_t2)
                water_res = ChangeDetectionService.detect_water_shrinkage(
                    (ndvi_t1 < 0.0).astype("uint8"),
                    (ndvi_t2 < 0.0).astype("uint8"),
                )

                # Rakamlarin gorsel karsiligi. Diziler zaten elde, dosyalari
                # ikinci kez okumuyoruz.
                if render_ndvi_change_map(
                    ndvi_t1, ndvi_t2, change_map_path(lat, lon)
                ):
                    change_map = {
                        "from_year": downloaded[0]["year"],
                        "to_year": downloaded[-1]["year"],
                    }

    deforestation = {
        "detected": def_res["detected"],
        "loss_percentage": def_res["loss_percentage"],
        "severity": _severity_for_deforestation(def_res["loss_percentage"]),
    }
    lake_shrinkage = {
        "detected": water_res["detected"],
        "shrinkage_percentage": water_res["shrinkage_percentage"],
        "severity": _severity_for_lake_shrinkage(water_res["shrinkage_percentage"]),
    }

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    ai_results_dict = {
        "timestamp": timestamp,
        "model_loaded": model_loaded,
        "yolo_detections": detections,
        "environmental_metrics": {
            "ndvi_t1_mean": ndvi_t1_mean,
            "ndvi_t2_mean": ndvi_t2_mean,
            "ndvi_change": ndvi_change,
        },
        "change_detection": {
            "deforestation": deforestation,
            "lake_shrinkage": lake_shrinkage,
        },
        "restricted_area": {
            "bbox": None,
            "center": {"lat": lat, "lon": lon},
            "buffer_meters": buffer_meters,
            "has_geojson": False,
        },
    }

    fire_risk = _max_risk(
        _risk_from_detections(detections, "fire"),
        _risk_from_vegetation_loss(deforestation),
    )
    pollution_level = _risk_from_detections(detections, "pollution")

    return {
        # --- Frontend Analytics/Report bilesenlerinin dogrudan okudugu duz alanlar ---
        "status": "Analiz tamamlandı",
        "timestamp": timestamp,
        "region_name": region_name or f"{lat:.4f}, {lon:.4f}",
        "coordinates": {"lat": lat, "lon": lon, "buffer_meters": buffer_meters},
        "ndvi_score": ndvi_t2_mean,
        "fire_risk": fire_risk,
        "pollution_level": pollution_level,
        # --- Durum bayraklari ---
        "demo_mode": demo_mode,
        "model_loaded": model_loaded,
        # --- Gorseller ---
        # URL'ler burada uretilmiyor; frontend bunlari coordinates + years ile
        # kuruyor, boylece proxy oneki backend'e ve saklanan JSON'a sizmiyor.
        "images": {
            "size": int(THUMB_SIZE.split("x")[0]),
            "available": bool(downloaded),
            "years": [item["year"] for item in downloaded],
            "change_map": change_map,
        },
        # --- Detayli sonuc ---
        "ai_results": ai_results_dict,
        "downloaded": downloaded,
    }
