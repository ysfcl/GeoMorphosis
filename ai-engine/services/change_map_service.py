"""
GeoMorphosis - NDVI Degisim Haritasi
Iki tarihteki NDVI matrisinin farkini renklendirilmis saydam bir katmana cevirir.
Panelde yazan "%11.04 bitki ortusu kaybi" rakaminin gorsel karsiligi budur.
"""

import numpy as np

from services.change_detection_service import VEGETATION_LOSS_THRESHOLD

# Bu buyuklugun uzerindeki degisim tam yogunlukta gosterilir.
CHANGE_CLIP = 0.5

# Haritanin boyadigi esik, kayip yuzdesini hesaplayan esikle AYNI olmali.
# Farkli olsaydi (once 0.05 idi) harita %40 kirmizi gosterirken panel %11
# kayip yaziyordu; gorsel rakami yalanliyordu.
CHANGE_THRESHOLD = VEGETATION_LOSS_THRESHOLD

# cv2 BGRA sirasiyla yaziyor. Renkler arayuzdeki paletle ayni
# (tailwind red-500 #ef4444, green-500 #22c55e).
LOSS_BGRA = (68, 68, 239, 0)
GAIN_BGRA = (94, 197, 34, 0)

# Zayif degisim de gorunsun ama guclu degisimi bastirmasin.
ALPHA_MIN = 70
ALPHA_MAX = 235


def build_change_rgba(ndvi_t1: np.ndarray, ndvi_t2: np.ndarray) -> np.ndarray:
    """NDVI farkindan BGRA katmani uretir.

    Negatif fark (bitki kaybi) kirmizi, pozitif fark (artis) yesil,
    esik altindaki degisim tamamen saydam olur. Saydamlik sayesinde
    katman uydu goruntusunun uzerine bindirilebiliyor.

    cv2'den bagimsiz tutuldu; renk mantigi boylece tek basina test edilebiliyor.
    """
    if ndvi_t1.shape != ndvi_t2.shape:
        raise ValueError(
            f"NDVI matrisleri ayni boyutta olmali: {ndvi_t1.shape} != {ndvi_t2.shape}"
        )

    diff = (ndvi_t2.astype("float32") - ndvi_t1.astype("float32"))
    magnitude = np.clip(np.abs(diff), 0.0, CHANGE_CLIP)
    significant = magnitude > CHANGE_THRESHOLD

    rgba = np.zeros(diff.shape + (4,), dtype="uint8")
    rgba[significant & (diff < 0)] = LOSS_BGRA
    rgba[significant & (diff > 0)] = GAIN_BGRA

    # Saydamlik degisimin siddetiyle orantili
    scaled = (magnitude - CHANGE_THRESHOLD) / (CHANGE_CLIP - CHANGE_THRESHOLD)
    alpha = ALPHA_MIN + scaled * (ALPHA_MAX - ALPHA_MIN)
    rgba[..., 3] = np.where(significant, np.clip(alpha, 0, 255), 0).astype("uint8")

    return rgba


def render_ndvi_change_map(ndvi_t1: np.ndarray, ndvi_t2: np.ndarray, out_path: str):
    """Degisim haritasini RGBA PNG olarak diske yazar.

    Basarisizlik analizi cokertmemeli; harita uretilemezse None doner ve
    arayuz o sekmeyi gizler.
    """
    try:
        import cv2

        rgba = build_change_rgba(ndvi_t1, ndvi_t2)
        if not cv2.imwrite(out_path, rgba):
            print(f"Degisim haritasi yazilamadi: {out_path}")
            return None

        return out_path
    except Exception as e:
        print(f"Degisim haritasi uretilemedi ({out_path}): {e}")
        return None
