from pathlib import Path
from ultralytics import YOLO


class YoloService:
    model_path = Path(__file__).resolve().parent.parent / "yolov8n.pt"
    model = None

    @classmethod
    def load_model(cls):
        if cls.model is None:
            if not cls.model_path.exists():
                alternative = Path(__file__).resolve().parent.parent / "models" / "fire_yolov8.pt"
                if alternative.exists():
                    cls.model_path = alternative
                else:
                    raise FileNotFoundError(
                        f"YOLO model bulunamadi: {cls.model_path} veya {alternative}"
                    )
            cls.model = YOLO(str(cls.model_path))
        return cls.model

    @classmethod
    def predict(cls, image_path: str) -> dict:
        model = cls.load_model()
        results = model.predict(source=image_path, save=False)
        boxes = []
        for result in results:
            for box in result.boxes:
                boxes.append(
                    {
                        "class": int(box.cls.item()) if box.cls is not None else -1,
                        "confidence": float(box.conf.item()) if box.conf is not None else 0.0,
                        "bbox": [float(v) for v in box.xyxy[0].tolist()] if box.xyxy is not None else [0.0, 0.0, 0.0, 0.0],
                    }
                )
        return {"boxes": boxes}
