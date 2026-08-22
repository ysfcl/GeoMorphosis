"""
GeoMorphosis - Change Detection Service
T1 (Önceki) ve T2 (Sonraki) tarihlerindeki NDVI ve Su kütlesi değişimlerini analiz eder.
"""

import numpy as np


# Bitki kaybi sayilmasi icin gereken en kucuk NDVI dususu.
# Degisim haritasi da ayni esigi kullaniyor (change_map_service); aksi halde
# haritadaki kirmizi alan panelde yazan yuzdeyle ortusmuyor.
VEGETATION_LOSS_THRESHOLD = 0.25


class ChangeDetectionService:

    @staticmethod
    def detect_vegetation_loss(
        ndvi_t1: np.ndarray,
        ndvi_t2: np.ndarray,
        threshold: float = VEGETATION_LOSS_THRESHOLD,
    ):
        """
        Ağaçsızlaşma (Deforestation) tespiti:
        T1 ve T2 NDVI matrisleri arasındaki farkı alır.
        NDVI düşüşü threshold değerinden büyükse bitki kaybı var demektir.
        """
        ndvi_diff = ndvi_t1 - ndvi_t2
        loss_mask = ndvi_diff > threshold

        total_pixels = ndvi_t1.size
        loss_pixels = np.sum(loss_mask)
        loss_percentage = (loss_pixels / total_pixels) * 100

        return {
            "loss_percentage": round(float(loss_percentage), 2),
            "loss_pixel_count": int(loss_pixels),
            "detected": bool(loss_percentage > 1.0),  # %1'den büyükse anlamlı değişim
        }

    @staticmethod
    def detect_water_shrinkage(
        water_mask_t1: np.ndarray,
        water_mask_t2: np.ndarray,
        threshold: float = 0.15,
    ):
        """
        Göl / Su Yüzeyi Küçülmesi Tespiti:
        T1'de su olan ancak T2'de karaya dönüşen alanları tespit eder.
        """
        # T1'de 1 (su), T2'de 0 (kara) olan pikseller
        shrinkage_mask = (water_mask_t1 == 1) & (water_mask_t2 == 0)

        t1_water_pixels = np.sum(water_mask_t1 == 1)
        shrinkage_pixels = np.sum(shrinkage_mask)

        if t1_water_pixels > 0:
            shrinkage_percentage = (
                shrinkage_pixels / t1_water_pixels
            ) * 100
        else:
            shrinkage_percentage = 0.0

        return {
            "shrinkage_percentage": round(float(shrinkage_percentage), 2),
            "shrinkage_pixel_count": int(shrinkage_pixels),
            "detected": bool(shrinkage_percentage > 2.0),
        }