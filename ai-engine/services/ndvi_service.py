import numpy as np
import rasterio


class NdviService:
    @staticmethod
    def calculate_ndvi(image_path: str) -> np.ndarray:
        """NDVI png veya çok bantlı uydu görüntüsünden NDVI matrisini hesaplar."""
        with rasterio.open(image_path) as src:
            array = src.read().astype("float32")

        if array.ndim == 3 and array.shape[0] == 1:
            ndvi = array[0]
        elif array.ndim == 3 and array.shape[0] >= 3:
            first = array[0]
            if np.allclose(array[0], array[1]) and np.allclose(array[0], array[2]):
                ndvi = first
            elif array.shape[0] >= 4:
                red = array[0]
                nir = array[3] if array.shape[0] > 3 else array[0]
                denom = nir + red
                denom[denom == 0] = 1
                ndvi = (nir - red) / denom
            else:
                ndvi = first
        else:
            raise ValueError("NDVI hesaplamak icin yeterli bant yok")

        if ndvi.max() > 1.0 or ndvi.min() < -1.0:
            ndvi = (ndvi / 255.0) * 2.0 - 1.0

        return ndvi
