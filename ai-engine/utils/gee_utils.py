import ee

def init_gee(project_id="geomorphosis"):
    try:
        ee.Initialize(project=project_id)
        print("✅ GEE Başarıyla Başlatıldı.")
    except Exception:
        ee.Authenticate()
        ee.Initialize(project=project_id)


def mask_clouds_s2(image):
    qa = image.select("QA60")
    cloud_mask = qa.bitwiseAnd(1 << 10).eq(0)
    cirrus_mask = qa.bitwiseAnd(1 << 11).eq(0)
    return image.updateMask(cloud_mask.And(cirrus_mask)).divide(10000)


def mask_clouds_landsat(image):
    qa = image.select("QA_PIXEL")
    cloud_shadow_bit_mask = 1 << 3
    clouds_bit_mask = 1 << 4
    mask = qa.bitwiseAnd(cloud_shadow_bit_mask).eq(0).And(qa.bitwiseAnd(clouds_bit_mask).eq(0))
    return image.updateMask(mask).multiply(0.0000275).add(-0.2)


def get_satellite_composite(lat, lon, year, buffer_meters=2500):
    """
    Yıla göre uygun uydudan bulutsuz medyan bileşke alır.
    RGB + NDVI + NDWI bantlarını hesaplayarak döndürür.
    """
    point = ee.Geometry.Point([lon, lat])
    roi = point.buffer(buffer_meters).bounds()
    start_date = f"{year}-05-01"
    end_date = f"{year}-09-30"

    if year >= 2015:
        # Sentinel-2 (10m)
        collection = (
            ee.ImageCollection("COPERNICUS/S2_HARMONIZED")
            .filterBounds(roi)
            .filterDate(start_date, end_date)
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 25))
        )
        if collection.size().getInfo() > 0:
            img = collection.map(mask_clouds_s2).median()
            rgb = img.select(["B4", "B3", "B2"])
            ndvi = img.normalizedDifference(["B8", "B4"]).rename("NDVI")
            ndwi = img.normalizedDifference(["B3", "B8"]).rename("NDWI")
            return rgb.addBands([ndvi, ndwi]).clip(roi), roi

    if year >= 2013:
        # Landsat 8 (30m)
        collection = (
            ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
            .filterBounds(roi)
            .filterDate(start_date, end_date)
            .filter(ee.Filter.lt("CLOUD_COVER", 25))
        )
        if collection.size().getInfo() > 0:
            img = collection.map(mask_clouds_landsat).median()
            rgb = img.select(["SR_B4", "SR_B3", "SR_B2"])
            ndvi = img.normalizedDifference(["SR_B5", "SR_B4"]).rename("NDVI")
            ndwi = img.normalizedDifference(["SR_B3", "SR_B5"]).rename("NDWI")
            return rgb.addBands([ndvi, ndwi]).clip(roi), roi

    # Landsat 7 (2010 - 2012)
    collection = (
        ee.ImageCollection("LANDSAT/LE07/C02/T1_L2")
        .filterBounds(roi)
        .filterDate(start_date, end_date)
        .filter(ee.Filter.lt("CLOUD_COVER", 25))
    )
    img = collection.map(mask_clouds_landsat).median()
    rgb = img.select(["SR_B3", "SR_B2", "SR_B1"])
    ndvi = img.normalizedDifference(["SR_B4", "SR_B3"]).rename("NDVI")
    ndwi = img.normalizedDifference(["SR_B2", "SR_B4"]).rename("NDWI")
    return rgb.addBands([ndvi, ndwi]).clip(roi), roi