import requests
import os
from pathlib import Path

_ee_initialized = False
_ee_error = None
_ee_available = False

RGB_BANDS = ["B4", "B3", "B2"]
NIR_BAND = "B8"
THUMB_SIZE = "512x512"


class EarthEngineError(Exception):
    pass


def _default_cache_dir():
    """Indirilen goruntulerin yazilacagi klasor.

    Varsayilan olarak ai-engine/data/cache; docker-compose bu yolu
    ./data:/app/data mount'u ile paylasiyor (bkz. utils/index.py DATA_DIR).
    """
    env_dir = os.environ.get("SATELLITE_CACHE_DIR")
    if env_dir:
        return env_dir
    return str(Path(__file__).resolve().parent.parent / "data" / "cache")


def _coordinate_slug(lat, lon):
    """Farkli bolgelerin onbellek dosyalarini birbirine karistirmamak icin."""
    return f"{lat:.4f}_{lon:.4f}".replace("-", "m").replace(".", "p")


# Dosya adi kurali tek yerde: hem yazan (download_satellite_series) hem sunan
# (main.py /images) tarafi asagidaki iki fonksiyonu kullaniyor. Boylece
# isimlendirme degisirse iki taraf birbirinden kopmuyor.

def cached_image_path(lat, lon, year, kind, output_dir=None):
    """Yil bazli uydu karosunun yolu. kind: 'rgb' veya 'ndvi'."""
    if kind not in ("rgb", "ndvi"):
        raise ValueError(f"Gecersiz goruntu turu: {kind}")

    base = output_dir or _default_cache_dir()
    return os.path.join(base, f"region_{_coordinate_slug(lat, lon)}_{year}_{kind}.png")


def change_map_path(lat, lon, output_dir=None):
    """NDVI degisim haritasinin yolu (yil bazli degil, bolge basina tek dosya)."""
    base = output_dir or _default_cache_dir()
    return os.path.join(base, f"region_{_coordinate_slug(lat, lon)}_diff.png")


def _download_thumb(image, vis_params, file_path):
    """GEE thumbnail URL'sini indirip diske yazar."""
    url = image.getThumbURL(vis_params)
    response = requests.get(url, timeout=60)
    response.raise_for_status()

    with open(file_path, "wb") as f:
        f.write(response.content)

    return file_path


def _init_earth_engine():
    global _ee_initialized, _ee_error, _ee_available
    if _ee_initialized:
        return

    try:
        import base64
        import tempfile

        import ee

        credentials_path = os.environ.get("GOOGLE_EARTH_ENGINE_CREDENTIALS")
        # Bulut ortamlarinda (Railway vb.) dosya mount edilemediginden
        # servis hesabi anahtari base64 ile env olarak tasinir.
        credentials_b64 = os.environ.get("GOOGLE_EARTH_ENGINE_CREDENTIALS_B64")
        project_id = os.environ.get("GOOGLE_EARTH_ENGINE_PROJECT", "geomorphosis")

        if credentials_path and os.path.exists(credentials_path):
            creds = ee.ServiceAccountCredentials(None, credentials_path)
            ee.Initialize(creds, project=project_id)
        elif credentials_b64:
            key_data = base64.b64decode(credentials_b64)
            with tempfile.NamedTemporaryFile(
                mode="wb", suffix=".json", delete=False
            ) as key_file:
                key_file.write(key_data)
                tmp_key_path = key_file.name
            creds = ee.ServiceAccountCredentials(None, tmp_key_path)
            ee.Initialize(creds, project=project_id)
        else:
            ee.Initialize(project=project_id)

        _ee_available = True
        _ee_initialized = True
        print("Google Earth Engine baslatildi")
    except Exception as e:
        _ee_error = str(e)
        _ee_initialized = True
        _ee_available = False
        print(f"Earth Engine kullanilamiyor: {e}")
        print("Demo moduyla calisilacak")


def _empty_result(year, status, **extra):
    """Tum dallarda ayni anahtar setini dondurmek icin ortak yardimci.

    analysis_service, indirilen goruntuleri rgb_path/ndvi_path alanlarina gore
    filtreledigi icin bu iki anahtarin her durumda bulunmasi gerekiyor.
    """
    result = {
        "year": year,
        "status": status,
        "path": None,
        "image_path": None,
        "rgb_path": None,
        "ndvi_path": None,
    }
    result.update(extra)
    return result


def _mock_satellite_results(lat, lon, years):
    return [
        _empty_result(
            year,
            "demo",
            note=f"Demo verisi - GEE yetkisi gerekli ({lat}, {lon})",
        )
        for year in years
    ]


def _mock_latest_image(lat, lon):
    return {
        "date": "2025-01-15",
        "url": None,
        "demo": True,
        "note": f"Demo verisi - GEE yetkisi gerekli ({lat}, {lon})",
    }


def download_satellite_series(
    lat,
    lon,
    buffer_meters=1000,
    years=None,
    output_dir=None,
):
    if years is None:
        years = [2020, 2023, 2025]

    _init_earth_engine()

    if not _ee_available:
        return _mock_satellite_results(lat, lon, years)

    import ee

    if output_dir is None:
        output_dir = _default_cache_dir()

    os.makedirs(output_dir, exist_ok=True)

    point = ee.Geometry.Point(lon, lat)
    roi = point.buffer(buffer_meters).bounds()
    print(f"Koordinat: [{lat}, {lon}] | Alan: {buffer_meters * 2}m x {buffer_meters * 2}m")

    results = []

    for year in years:
        start_date = f"{year}-06-01"
        end_date = f"{year}-09-30"

        dataset = (
            ee.ImageCollection("COPERNICUS/S2_HARMONIZED")
            .filterBounds(roi)
            .filterDate(start_date, end_date)
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 15))
            .select(RGB_BANDS + [NIR_BAND])
        )

        count = dataset.size().getInfo()
        if count == 0:
            print(f"{year}: Uygun goruntu bulunamadi, atlanıyor")
            results.append(_empty_result(year, "no_data"))
            continue

        image = dataset.median().clip(roi)

        try:
            # YOLO bu RGB goruntusu uzerinde calisiyor
            rgb_path = cached_image_path(lat, lon, year, "rgb", output_dir)
            _download_thumb(
                image,
                {
                    "bands": RGB_BANDS,
                    "min": 0,
                    "max": 3000,
                    "region": roi,
                    "dimensions": THUMB_SIZE,
                    "format": "png",
                },
                rgb_path,
            )

            # NDVI bandi ayri bir gri tonlamali PNG olarak indiriliyor;
            # NdviService bu dosyayi okuyup -1..1 araligina geri olcekliyor
            ndvi_image = image.normalizedDifference([NIR_BAND, RGB_BANDS[0]]).rename("NDVI")
            ndvi_path = cached_image_path(lat, lon, year, "ndvi", output_dir)
            _download_thumb(
                ndvi_image,
                {
                    "bands": ["NDVI"],
                    "min": -1,
                    "max": 1,
                    "region": roi,
                    "dimensions": THUMB_SIZE,
                    "format": "png",
                },
                ndvi_path,
            )

            print(f"{year} indirildi: {rgb_path} + {ndvi_path}")
            results.append(
                _empty_result(
                    year,
                    "ok",
                    path=rgb_path,
                    image_path=rgb_path,
                    rgb_path=rgb_path,
                    ndvi_path=ndvi_path,
                )
            )

        except requests.exceptions.RequestException as e:
            print(f"{year} indirme hatasi: {e}")
            results.append(_empty_result(year, "download_error"))
        except Exception as e:
            print(f"{year} genel hata: {e}")
            results.append(_empty_result(year, "error"))

    return results


def get_latest_image(lat, lon, buffer_meters=1000):
    _init_earth_engine()

    if not _ee_available:
        return _mock_latest_image(lat, lon)

    import ee

    point = ee.Geometry.Point(lon, lat)
    roi = point.buffer(buffer_meters).bounds()

    dataset = (
        ee.ImageCollection("COPERNICUS/S2_HARMONIZED")
        .filterBounds(roi)
        .filterDate("2024-01-01", "2025-12-31")
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 15))
        .select(["B4", "B3", "B2"])
        .sort("system:time_start", False)
    )

    count = dataset.size().getInfo()
    if count == 0:
        return None

    image = dataset.first().clip(roi)
    date = image.date().format("YYYY-MM-dd").getInfo()

    vis_params = {
        "bands": ["B4", "B3", "B2"],
        "min": 0,
        "max": 3000,
        "region": roi,
        "dimensions": "512x512",
        "format": "png",
    }

    url = image.getThumbURL(vis_params)
    return {"date": date, "url": url, "vis_params": vis_params}


if __name__ == "__main__":
    TARGET_LAT = 36.8530
    TARGET_LON = 28.2715
    BUFFER_DIST = 1000

    download_satellite_series(
        lat=TARGET_LAT,
        lon=TARGET_LON,
        buffer_meters=BUFFER_DIST,
        years=[2020, 2023, 2025],
    )
