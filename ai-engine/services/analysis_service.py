from datetime import datetime, timezone
from typing import Any

from services.change_detection_service import ChangeDetectionService
from services.ndvi_service import NdviService
from services.satellite_api import download_satellite_series
from services.yolo_service import YoloService


def _severity_for_deforestation(loss_percentage: float) -> str:
    if loss_percentage > 20:
        return "CRITICAL"
    if loss_percentage > 10:
        return "HIGH"
    return "LOW"


def _severity_for_lake_shrinkage(shrinkage_percentage: float) -> str:
    return "HIGH" if shrinkage_percentage > 5 else "NORMAL"


def analyze_region(lat: float, lon: float, buffer_meters: int = 1000, years: list[int] | None = None) -> dict[str, Any]:
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
    ndvi_t1_mean = 0.0
    ndvi_t2_mean = 0.0
    ndvi_change = 0.0
    def_res = {"detected": False, "loss_percentage": 0.0}
    water_res = {"detected": False, "shrinkage_percentage": 0.0}

    if downloaded:
        latest_rgb_path = downloaded[-1]["rgb_path"]

        yolo_raw = YoloService.predict(latest_rgb_path)
        for box in yolo_raw.get("boxes", []):
            detections.append(
                {
                    "class": box.get("class", "unknown"),
                    "confidence": round(float(box.get("confidence", 0.0)), 2),
                    "bbox": box.get("bbox", [0.0, 0.0, 0.0, 0.0]),
                }
            )

        if len(downloaded) >= 2:
            oldest_ndvi_path = downloaded[0]["ndvi_path"]
            latest_ndvi_path = downloaded[-1]["ndvi_path"]
            ndvi_t1 = NdviService.calculate_ndvi(oldest_ndvi_path)
            ndvi_t2 = NdviService.calculate_ndvi(latest_ndvi_path)

            ndvi_t1_mean = round(float(ndvi_t1.mean()), 2)
            ndvi_t2_mean = round(float(ndvi_t2.mean()), 2)
            ndvi_change = round(ndvi_t2_mean - ndvi_t1_mean, 2)

            def_res = ChangeDetectionService.detect_vegetation_loss(ndvi_t1, ndvi_t2)
            water_res = ChangeDetectionService.detect_water_shrinkage(
                (ndvi_t1 < 0.0).astype("uint8"),
                (ndvi_t2 < 0.0).astype("uint8"),
            )

    ai_results_dict = {
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "yolo_detections": detections,
        "environmental_metrics": {
            "ndvi_t1_mean": ndvi_t1_mean,
            "ndvi_t2_mean": ndvi_t2_mean,
            "ndvi_change": ndvi_change,
        },
        "change_detection": {
            "deforestation": {
                "detected": def_res["detected"],
                "loss_percentage": def_res["loss_percentage"],
                "severity": _severity_for_deforestation(def_res["loss_percentage"]),
            },
            "lake_shrinkage": {
                "detected": water_res["detected"],
                "shrinkage_percentage": water_res["shrinkage_percentage"],
                "severity": _severity_for_lake_shrinkage(
                    water_res["shrinkage_percentage"]
                ),
            },
        },
    }

    return {
        "demo_mode": demo_mode,
        "ai_results": ai_results_dict,
        "downloaded": downloaded,
    }
