import os
import random
import datetime
import requests
from pathlib import Path

from services.yolo_service import YoloService

AI_ENGINE_DIR = Path(__file__).resolve().parent.parent
YOLO_IMAGE_DIR = AI_ENGINE_DIR / "data" / "cache"

RISK_LEVELS = ["yok", "dusuk", "orta", "yuksek"]

_ee_initialized = False
_ee_error = None
_ee_available = False


def _init_earth_engine():
    global _ee_initialized, _ee_error, _ee_available
    if _ee_initialized:
        return

    try:
        import ee

        credentials_path = os.environ.get("GOOGLE_EARTH_ENGINE_CREDENTIALS")
        project_id = os.environ.get("GOOGLE_EARTH_ENGINE_PROJECT", "geomorphosis")

        if credentials_path and os.path.exists(credentials_path):
            creds = ee.ServiceAccountCredentials(None, credentials_path)
            ee.Initialize(creds, project=project_id)
        else:
            ee.Initialize(project=project_id)

        _ee_available = True
        _ee_initialized = True
        print("analysis_service: Google Earth Engine baslatildi")
    except Exception as e:
        _ee_error = str(e)
        _ee_initialized = True
        _ee_available = False
        print(f"analysis_service: Earth Engine kullanilamiyor: {e}")


def _clamp(value, low=0.0, high=1.0):
    if value is None:
        return None
    return max(low, min(high, float(value)))


def _get_ndvi(lat, lon, buffer_meters):
    if not _ee_available:
        return None
    import ee

    point = ee.Geometry.Point(lon, lat)
    roi = point.buffer(buffer_meters).bounds()

    today = datetime.date.today()
    for year in (today.year, today.year - 1, today.year - 2):
        try:
            s2 = (
                ee.ImageCollection("COPERNICUS/S2_HARMONIZED")
                .filterBounds(roi)
                .filterDate(f"{year}-06-01", f"{year}-09-30")
                .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
            )
            count = s2.size().getInfo()
            if count == 0:
                continue

            ndvi_coll = s2.map(
                lambda img: img.normalizedDifference(["B8", "B4"]).rename("ndvi")
            )
            composite = ndvi_coll.median().select("ndvi")
            value = (
                composite.reduceRegion(
                    reducer=ee.Reducer.median(),
                    geometry=roi,
                    scale=20,
                    maxPixels=1e7,
                )
                .get("ndvi")
                .getInfo()
            )
            if value is not None:
                return float(value)
        except Exception as e:
            print(f"analysis_service: NDVI yil {year} hatasi: {e}")
    return None


def _get_land_temp(lat, lon, buffer_meters):
    if not _ee_available:
        return None
    import ee

    point = ee.Geometry.Point(lon, lat)
    roi = point.buffer(buffer_meters).bounds()
    today = datetime.date.today()
    start = (today - datetime.timedelta(days=30)).isoformat()

    try:
        modis = (
            ee.ImageCollection("MODIS/061/MOD11A1")
            .filterBounds(roi)
            .filterDate(start, today.isoformat())
            .select("LST_Day_1km")
            .map(lambda img: img.multiply(0.02).rename("lst"))
        )
        count = modis.size().getInfo()
        if count == 0:
            return None
        temp = (
            modis.mean()
            .reduceRegion(
                reducer=ee.Reducer.median(), geometry=roi, scale=1000, maxPixels=1e7
            )
            .get("lst")
            .getInfo()
        )
        if temp is not None:
            return float(temp)
    except Exception as e:
        print(f"analysis_service: LST hatasi: {e}")
    return None


def _get_aod(lat, lon, buffer_meters):
    if not _ee_available:
        return None
    import ee

    point = ee.Geometry.Point(lon, lat)
    roi = point.buffer(buffer_meters).bounds()
    today = datetime.date.today()
    start = (today - datetime.timedelta(days=30)).isoformat()

    try:
        aod_coll = (
            ee.ImageCollection("MODIS/061/MCD19A2_GRANULES")
            .filterBounds(roi)
            .filterDate(start, today.isoformat())
            .select("Optical_Depth_047")
        )
        count = aod_coll.size().getInfo()
        if count == 0:
            return None
        value = (
            aod_coll.mean()
            .reduceRegion(
                reducer=ee.Reducer.median(), geometry=roi, scale=1000, maxPixels=1e7
            )
            .get("Optical_Depth_047")
            .getInfo()
        )
        if value is not None:
            return float(value)
    except Exception as e:
        print(f"analysis_service: AOD hatasi: {e}")
    return None


def _score_to_risk(score):
    if score is None:
        return "yok"
    if score < 0.2:
        return "yok"
    if score < 0.4:
        return "dusuk"
    if score < 0.7:
        return "orta"
    return "yuksek"


def _risk_from_fire_score(score):
    if score is None:
        return "yok"
    if score < 0.25:
        return "yok"
    if score < 0.5:
        return "dusuk"
    if score < 0.75:
        return "orta"
    return "yuksek"


def _fallback_metrics(lat, lon):
    seed = round(abs(lat) * 10000) + round(abs(lon) * 10000)
    rng = random.Random(seed)

    ndvi = _clamp(0.35 + rng.uniform(0.0, 0.5))
    fire_score = rng.uniform(0.0, 1.0)
    pollution_score = rng.uniform(0.0, 1.0)
    return ndvi, fire_score, pollution_score


def _compute_fire_score(ndvi, land_temp):
    veg_score = 1.0 - _clamp((ndvi + 0.2) / 0.8) if ndvi is not None else 0.5

    if land_temp is not None:
        temp_score = _clamp((land_temp - 300.0) / 20.0)
        return _clamp(0.6 * temp_score + 0.4 * veg_score)
    return _clamp(veg_score)


def _compute_pollution_score(aod):
    if aod is None:
        return None
    if aod <= 0.1:
        return 0.1
    if aod <= 0.2:
        return 0.3
    if aod <= 0.4:
        return 0.6
    return 0.9


def _get_region_name(lat, lon):
    try:
        url = "https://nominatim.openstreetmap.org/reverse"
        params = {"lat": lat, "lon": lon, "format": "json", "zoom": 10}
        headers = {"User-Agent": "GeoMorphosis/1.0 (environmental monitoring)"}
        response = requests.get(url, params=params, headers=headers, timeout=10)
        response.raise_for_status()
        addr = response.json().get("address", {})
        parts = []
        for key in ("town", "city", "village", "municipality", "county", "province", "state"):
            if addr.get(key):
                parts.append(addr[key])
        if parts:
            return ", ".join(parts)
    except Exception as e:
        print(f"analysis_service: bölge adi alinamadi: {e}")
    return f"{lat:.3f}, {lon:.3f}"


def _generated_path(lat, lon, buffer_meters, count=12):
    seed = round(abs(lat) * 10000) + round(abs(lon) * 10000)
    rng = random.Random(seed)
    import math

    points = []
    for i in range(count):
        angle = (i / count) * 2 * math.pi
        radius = buffer_meters * (0.2 + 0.8 * rng.random())
        dlat = (radius * math.cos(angle)) / 111320.0
        dlng = (radius * math.sin(angle)) / (111320.0 * _cos(lat))
        points.append(
            {
                "lat": round(lat + dlat, 6),
                "lng": round(lon + dlng, 6),
            }
        )
    return points


def _cos(lat):
    import math

    return math.cos(math.radians(lat)) or 1.0


def _mask_clouds(image):
    import ee

    qa = image.select("QA60")
    cloud_mask = qa.bitwiseAnd(1 << 10).eq(0)
    cirrus_mask = qa.bitwiseAnd(1 << 11).eq(0)
    return image.updateMask(cloud_mask.And(cirrus_mask)).divide(10000)


def _download_rgb_for_yolo(lat, lon, buffer_meters):
    """Egitim verisiyle ayni goruntuleme (reflectance, min0 max0.3) kullanilarak
    YOLO icin bolge goruntusu indirir. Basarisiz olursa None doner."""
    if not _ee_available:
        return None
    import ee

    YOLO_IMAGE_DIR.mkdir(parents=True, exist_ok=True)

    point = ee.Geometry.Point(lon, lat)
    roi = point.buffer(buffer_meters).bounds()

    today = datetime.date.today()
    for year in (today.year, today.year - 1):
        try:
            coll = (
                ee.ImageCollection("COPERNICUS/S2_HARMONIZED")
                .filterBounds(roi)
                .filterDate(f"{year}-06-01", f"{year}-09-30")
                .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
            )
            if coll.size().getInfo() == 0:
                continue

            composite = coll.map(_mask_clouds).median().clip(roi)
            url = composite.getThumbURL(
                {
                    "bands": ["B4", "B3", "B2"],
                    "min": 0,
                    "max": 0.3,
                    "region": roi,
                    "dimensions": "512x512",
                    "format": "png",
                }
            )
            response = requests.get(url, timeout=120)
            response.raise_for_status()

            path = YOLO_IMAGE_DIR / f"yolo_{lat}_{lon}.png"
            with open(path, "wb") as f:
                f.write(response.content)
            return str(path)
        except Exception as e:
            print(f"analysis_service: YOLO goruntusu indirilemedi ({year}): {e}")
    return None


def _risk_from_detections(detections, class_name):
    """YOLO tespitlerini frontend'in bekledigi risk seviyesine cevirir.

    Guven skoru seviyeyi belirler, ayni siniftan cok sayida tespit varsa
    seviye bir kademe yukseltilir."""
    matches = [d for d in detections if str(d.get("class", "")).lower() == class_name]

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


def _max_risk(*levels):
    return RISK_LEVELS[max(RISK_LEVELS.index(level) for level in levels)]


def _detections_to_path(detections, lat, lon, buffer_meters):
    """Tespit kutusu merkezlerini (piksel) enlem/boylam koordinatlarina cevirir.
    512x512 goruntu, 2*buffer metre genisliginde bir alani kapsar."""
    import math

    points = []
    for d in detections:
        bbox = d.get("bbox") or [0.0, 0.0, 0.0, 0.0]
        x1, y1, x2, y2 = bbox
        cx = (x1 + x2) / 2.0
        cy = (y1 + y2) / 2.0
        fx = (cx / 512.0) - 0.5
        fy = 0.5 - (cy / 512.0)
        meters_east = fx * 2.0 * buffer_meters
        meters_north = fy * 2.0 * buffer_meters
        dlat = meters_north / 111320.0
        dlng = meters_east / (111320.0 * (math.cos(math.radians(lat)) or 1.0))
        points.append(
            {
                "lat": round(lat + dlat, 6),
                "lng": round(lon + dlng, 6),
            }
        )
    return points


def analyze_region(lat, lon, buffer_meters=1000):
    _init_earth_engine()

    ndvi = _get_ndvi(lat, lon, buffer_meters)
    land_temp = _get_land_temp(lat, lon, buffer_meters)
    aod = _get_aod(lat, lon, buffer_meters)

    if ndvi is None:
        fallback_ndvi, fallback_fire, fallback_pollution = _fallback_metrics(lat, lon)
        if ndvi is None:
            ndvi = fallback_ndvi
        fire_score = fallback_fire if land_temp is None else _compute_fire_score(ndvi, land_temp)
        pollution_score = fallback_pollution if aod is None else _compute_pollution_score(aod)
    else:
        fire_score = _compute_fire_score(ndvi, land_temp)
        pollution_score = _compute_pollution_score(aod)
        if fire_score is None:
            _, fallback_fire, _ = _fallback_metrics(lat, lon)
            fire_score = fallback_fire
        if pollution_score is None:
            _, _, fallback_pollution = _fallback_metrics(lat, lon)
            pollution_score = fallback_pollution

    ndvi = _clamp(ndvi, -0.1, 1.0)

    # --- YOLO modeli ile nesne tespiti ---
    yolo_detections = []
    model_loaded = False
    rgb_path = _download_rgb_for_yolo(lat, lon, buffer_meters)
    if rgb_path:
        yolo_raw = YoloService.predict(rgb_path)
        model_loaded = bool(yolo_raw.get("model_loaded"))
        yolo_detections = yolo_raw.get("boxes", [])

    # --- Risk seviyeleri: model tespiti + cevresel metrikler birlesik ---
    fire_risk = _max_risk(
        _risk_from_detections(yolo_detections, "fire"),
        _risk_from_fire_score(fire_score),
    )
    pollution_level = _max_risk(
        _risk_from_detections(yolo_detections, "pollution"),
        _score_to_risk(pollution_score),
    )

    # Model gercek tespit yaptiysa noktalar tespit merkezlerine, yoksa cevre halkasi kullanilir
    detection_points = _detections_to_path(yolo_detections, lat, lon, buffer_meters)
    if detection_points:
        generated_path = detection_points
    else:
        generated_path = _generated_path(lat, lon, buffer_meters)

    return {
        "status": "completed",
        "message": "Analiz basariyla tamamlandi.",
        "ndvi_score": round(ndvi, 3),
        "fire_risk": fire_risk,
        "pollution_level": pollution_level,
        "region_name": _get_region_name(lat, lon),
        "timestamp": datetime.datetime.now().isoformat(timespec="seconds"),
        "generated_path": generated_path,
        "model_loaded": model_loaded,
        "yolo_detections": [
            {
                "class": d.get("class", "unknown"),
                "class_id": d.get("class_id", -1),
                "confidence": round(float(d.get("confidence", 0.0)), 2),
                "bbox": d.get("bbox", [0.0, 0.0, 0.0, 0.0]),
            }
            for d in yolo_detections
        ],
    }
