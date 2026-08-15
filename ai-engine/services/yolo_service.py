import os
from pathlib import Path

AI_ENGINE_DIR = Path(__file__).resolve().parent.parent

# Agirlik arama sirasi: fine-tune edilmis model once, en sonda pretrained nano.
CANDIDATE_WEIGHTS = [
    AI_ENGINE_DIR / "models" / "best.pt",
    AI_ENGINE_DIR / "models" / "fire_yolov8_v2.pt",
    AI_ENGINE_DIR / "models" / "fire_yolov8.pt",
    AI_ENGINE_DIR / "yolov8n.pt",
]

# Model kendi isimlerini bildirmezse bu liste yedek olarak kullanilir.
FALLBACK_CLASS_NAMES = ["fire", "pollution"]

CONFIDENCE_THRESHOLD = float(os.environ.get("YOLO_CONF_THRESHOLD", "0.25"))


class YoloService:
    model = None
    model_path = None
    available = None  # None = henuz denenmedi

    @classmethod
    def _candidate_paths(cls):
        env_path = os.environ.get("MODEL_PATH")
        if env_path:
            return [Path(env_path)] + CANDIDATE_WEIGHTS
        return list(CANDIDATE_WEIGHTS)

    @classmethod
    def load_model(cls):
        """Modeli yukler. Agirlik veya ultralytics yoksa None doner (exception atmaz).

        Analiz zincirinin tamami tek bir eksik dosya yuzunden cokmemeli;
        model yoksa demo moduna dusuluyor.
        """
        if cls.available is not None:
            return cls.model

        for path in cls._candidate_paths():
            if not path.exists():
                continue
            try:
                from ultralytics import YOLO

                cls.model = YOLO(str(path))
                cls.model_path = str(path)
                cls.available = True
                print(f"YOLO modeli yuklendi: {path}")
                return cls.model
            except Exception as e:
                print(f"YOLO modeli yuklenemedi ({path}): {e}")

        cls.model = None
        cls.model_path = None
        cls.available = False
        print(
            "YOLO agirligi bulunamadi. Aranan yollar: "
            + ", ".join(str(p) for p in cls._candidate_paths())
        )
        print("Nesne tespiti olmadan (demo modu) devam ediliyor.")
        return None

    @classmethod
    def class_name(cls, class_id: int) -> str:
        """Sinif id'sini okunabilir isme cevirir (frontend ham int ile calisamaz)."""
        names = getattr(cls.model, "names", None)
        if isinstance(names, dict):
            return str(names.get(class_id, class_id))
        if isinstance(names, (list, tuple)) and 0 <= class_id < len(names):
            return str(names[class_id])
        if 0 <= class_id < len(FALLBACK_CLASS_NAMES):
            return FALLBACK_CLASS_NAMES[class_id]
        return str(class_id)

    @classmethod
    def predict(cls, image_path: str) -> dict:
        model = cls.load_model()

        if model is None:
            return {"boxes": [], "model_loaded": False, "model_path": None}

        try:
            results = model.predict(
                source=image_path,
                save=False,
                conf=CONFIDENCE_THRESHOLD,
                verbose=False,
            )
        except Exception as e:
            print(f"YOLO tahmini basarisiz ({image_path}): {e}")
            return {"boxes": [], "model_loaded": True, "model_path": cls.model_path}

        boxes = []
        for result in results:
            for box in result.boxes:
                class_id = int(box.cls.item()) if box.cls is not None else -1
                boxes.append(
                    {
                        "class_id": class_id,
                        "class": cls.class_name(class_id),
                        "confidence": float(box.conf.item()) if box.conf is not None else 0.0,
                        "bbox": [float(v) for v in box.xyxy[0].tolist()]
                        if box.xyxy is not None
                        else [0.0, 0.0, 0.0, 0.0],
                    }
                )

        return {"boxes": boxes, "model_loaded": True, "model_path": cls.model_path}
