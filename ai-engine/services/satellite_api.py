import requests
import os
from pathlib import Path

_ee_initialized = False
_ee_error = None
_ee_available = False


class EarthEngineError(Exception):
    pass


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
        print("Google Earth Engine baslatildi")
    except Exception as e:
        _ee_error = str(e)
        _ee_initialized = True
        _ee_available = False
        print(f"Earth Engine kullanilamiyor: {e}")
        print("Demo moduyla calisilacak")


def _mock_satellite_results(lat, lon, years):
    results = []
    for year in years:
        results.append({
            "year": year,
            "status": "demo",
            "path": None,
            "image_path": None,
            "rgb_path": None,
            "ndvi_path": None,
            "note": f"Demo verisi - GEE yetkisi gerekli ({lat}, {lon})",
        })
    return results


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
        output_dir = str(Path(__file__).resolve().parent.parent.parent / "data" / "cache")

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
            .select(["B4", "B3", "B2"])
        )

        count = dataset.size().getInfo()
        if count == 0:
            print(f"{year}: Uygun goruntu bulunamadi, atlanıyor")
            results.append({
                "year": year,
                "status": "no_data",
                "path": None,
                "image_path": None,
                "rgb_path": None,
                "ndvi_path": None,
            })
            continue

        image = dataset.median().clip(roi)

        vis_params = {
            "bands": ["B4", "B3", "B2"],
            "min": 0,
            "max": 3000,
            "region": roi,
            "dimensions": "512x512",
            "format": "png",
        }

        try:
            url = image.getThumbURL(vis_params)
            response = requests.get(url, timeout=60)
            response.raise_for_status()

            file_path = os.path.join(output_dir, f"region_{year}.png")
            with open(file_path, "wb") as f:
                f.write(response.content)

            print(f"{year} indirildi: {file_path}")
            results.append(
                {
                    "year": year,
                    "status": "ok",
                    "path": file_path,
                    "image_path": file_path,
                }
            )

        except requests.exceptions.RequestException as e:
            print(f"{year} indirme hatasi: {e}")
            results.append(
                {
                    "year": year,
                    "status": "download_error",
                    "path": None,
                    "image_path": None,
                    "rgb_path": None,
                    "ndvi_path": None,
                }
            )
        except Exception as e:
            print(f"{year} genel hata: {e}")
            results.append(
                {
                    "year": year,
                    "status": "error",
                    "path": None,
                    "image_path": None,
                    "rgb_path": None,
                    "ndvi_path": None,
                }
            )

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
