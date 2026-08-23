import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services import analysis_service


def _detection(class_name, confidence):
    return {"class": class_name, "confidence": confidence, "bbox": [0, 0, 1, 1]}


def test_risk_is_yok_when_no_detection_of_that_class():
    detections = [_detection("pollution", 0.9)]

    assert analysis_service._risk_from_detections(detections, "fire") == "yok"


@pytest.mark.parametrize(
    "confidence,expected",
    [(0.30, "dusuk"), (0.55, "orta"), (0.85, "yuksek")],
)
def test_risk_scales_with_confidence(confidence, expected):
    detections = [_detection("fire", confidence)]

    assert analysis_service._risk_from_detections(detections, "fire") == expected


def test_multiple_detections_raise_the_level_one_step():
    detections = [_detection("fire", 0.30) for _ in range(3)]

    assert analysis_service._risk_from_detections(detections, "fire") == "orta"


def test_risk_level_never_exceeds_yuksek():
    detections = [_detection("fire", 0.95) for _ in range(5)]

    assert analysis_service._risk_from_detections(detections, "fire") == "yuksek"


@pytest.mark.parametrize(
    "deforestation,expected",
    [
        ({"detected": False, "severity": "CRITICAL"}, "yok"),
        ({"detected": True, "severity": "LOW"}, "dusuk"),
        ({"detected": True, "severity": "HIGH"}, "orta"),
        ({"detected": True, "severity": "CRITICAL"}, "yuksek"),
    ],
)
def test_vegetation_loss_maps_to_fire_risk(deforestation, expected):
    assert analysis_service._risk_from_vegetation_loss(deforestation) == expected


def test_max_risk_picks_the_highest_level():
    assert analysis_service._max_risk("yok", "orta", "dusuk") == "orta"


def test_risk_values_match_frontend_keys():
    """Analytics/index.js RISK_LABELS tam olarak bu anahtarlari bekliyor."""
    assert analysis_service.RISK_LEVELS == ["yok", "dusuk", "orta", "yuksek"]


def test_analyze_region_returns_full_contract_in_demo_mode(monkeypatch):
    """Uydu verisi yokken bile frontend'in okudugu duz alanlar dolu gelmeli."""
    monkeypatch.setattr(
        analysis_service,
        "download_satellite_series",
        lambda **kwargs: [
            {
                "year": 2025,
                "status": "demo",
                "path": None,
                "image_path": None,
                "rgb_path": None,
                "ndvi_path": None,
            }
        ],
    )

    result = analysis_service.analyze_region(36.853, 28.2715)

    assert result["demo_mode"] is True
    assert result["model_loaded"] is False
    assert result["region_name"] == "36.8530, 28.2715"
    assert result["ndvi_score"] == 0.0
    # Report/index.js bu alanlarda .toUpperCase() cagiriyor, None olmamali
    assert result["fire_risk"] == "yok"
    assert result["pollution_level"] == "yok"
    assert result["status"]
    assert result["timestamp"]
    assert "yolo_detections" in result["ai_results"]
    assert "change_detection" in result["ai_results"]


def test_analyze_region_derives_flat_fields_from_detections(monkeypatch, tmp_path):
    rgb = tmp_path / "rgb.png"
    ndvi = tmp_path / "ndvi.png"
    rgb.write_bytes(b"x")
    ndvi.write_bytes(b"x")

    monkeypatch.setattr(
        analysis_service,
        "download_satellite_series",
        lambda **kwargs: [
            {
                "year": 2025,
                "status": "ok",
                "path": str(rgb),
                "image_path": str(rgb),
                "rgb_path": str(rgb),
                "ndvi_path": str(ndvi),
            }
        ],
    )
    monkeypatch.setattr(
        analysis_service.YoloService,
        "predict",
        classmethod(
            lambda cls, path: {
                "boxes": [
                    {"class": "fire", "class_id": 0, "confidence": 0.82, "bbox": [1, 2, 3, 4]},
                    {"class": "pollution", "class_id": 1, "confidence": 0.45, "bbox": [5, 6, 7, 8]},
                ],
                "model_loaded": True,
                "model_path": "models/fire_yolov8.pt",
            }
        ),
    )
    # NDVI okunamasa bile (rasterio yok / bozuk dosya) analiz cokmemeli
    monkeypatch.setattr(analysis_service, "_safe_ndvi", lambda path: None)

    result = analysis_service.analyze_region(40.1885, 29.0610, region_name="Bursa")

    assert result["region_name"] == "Bursa"
    assert result["model_loaded"] is True
    assert result["fire_risk"] == "yuksek"
    assert result["pollution_level"] == "orta"
    assert len(result["ai_results"]["yolo_detections"]) == 2
    assert result["ai_results"]["yolo_detections"][0]["class"] == "fire"


def test_images_field_is_empty_in_demo_mode(monkeypatch):
    """Uydu verisi yokken arayuz kirik gorsel gostermemeli."""
    monkeypatch.setattr(
        analysis_service,
        "download_satellite_series",
        lambda **kwargs: [
            {
                "year": 2025,
                "status": "demo",
                "path": None,
                "image_path": None,
                "rgb_path": None,
                "ndvi_path": None,
            }
        ],
    )

    images = analysis_service.analyze_region(36.853, 28.2715)["images"]

    assert images["available"] is False
    assert images["years"] == []
    assert images["change_map"] is None
    assert images["size"] == 512


def test_images_field_lists_downloaded_years(monkeypatch, tmp_path):
    rgb, ndvi = tmp_path / "rgb.png", tmp_path / "ndvi.png"
    rgb.write_bytes(b"x")
    ndvi.write_bytes(b"x")

    def _entry(year):
        return {
            "year": year,
            "status": "ok",
            "path": str(rgb),
            "image_path": str(rgb),
            "rgb_path": str(rgb),
            "ndvi_path": str(ndvi),
        }

    monkeypatch.setattr(
        analysis_service,
        "download_satellite_series",
        lambda **kwargs: [_entry(2020), _entry(2023), _entry(2025)],
    )
    monkeypatch.setattr(
        analysis_service.YoloService,
        "predict",
        classmethod(lambda cls, path: {"boxes": [], "model_loaded": True}),
    )
    monkeypatch.setattr(analysis_service, "_safe_ndvi", lambda path: None)

    images = analysis_service.analyze_region(36.853, 28.2715)["images"]

    assert images["available"] is True
    assert images["years"] == [2020, 2023, 2025]


def test_change_map_is_reported_when_rendering_succeeds(monkeypatch, tmp_path):
    import numpy as np

    rgb, ndvi = tmp_path / "rgb.png", tmp_path / "ndvi.png"
    rgb.write_bytes(b"x")
    ndvi.write_bytes(b"x")

    def _entry(year):
        return {
            "year": year,
            "status": "ok",
            "path": str(rgb),
            "image_path": str(rgb),
            "rgb_path": str(rgb),
            "ndvi_path": str(ndvi),
        }

    monkeypatch.setattr(
        analysis_service,
        "download_satellite_series",
        lambda **kwargs: [_entry(2020), _entry(2025)],
    )
    monkeypatch.setattr(
        analysis_service.YoloService,
        "predict",
        classmethod(lambda cls, path: {"boxes": [], "model_loaded": True}),
    )
    monkeypatch.setattr(
        analysis_service, "_safe_ndvi", lambda path: np.full((4, 4), 0.5, dtype="float32")
    )
    monkeypatch.setattr(
        analysis_service, "render_ndvi_change_map", lambda t1, t2, out: out
    )

    images = analysis_service.analyze_region(36.853, 28.2715)["images"]

    assert images["change_map"] == {"from_year": 2020, "to_year": 2025}


def test_change_map_is_null_when_rendering_fails(monkeypatch, tmp_path):
    import numpy as np

    rgb, ndvi = tmp_path / "rgb.png", tmp_path / "ndvi.png"
    rgb.write_bytes(b"x")
    ndvi.write_bytes(b"x")

    def _entry(year):
        return {
            "year": year,
            "status": "ok",
            "path": str(rgb),
            "image_path": str(rgb),
            "rgb_path": str(rgb),
            "ndvi_path": str(ndvi),
        }

    monkeypatch.setattr(
        analysis_service,
        "download_satellite_series",
        lambda **kwargs: [_entry(2020), _entry(2025)],
    )
    monkeypatch.setattr(
        analysis_service.YoloService,
        "predict",
        classmethod(lambda cls, path: {"boxes": [], "model_loaded": True}),
    )
    monkeypatch.setattr(
        analysis_service, "_safe_ndvi", lambda path: np.full((4, 4), 0.5, dtype="float32")
    )
    monkeypatch.setattr(
        analysis_service, "render_ndvi_change_map", lambda t1, t2, out: None
    )

    images = analysis_service.analyze_region(36.853, 28.2715)["images"]

    assert images["change_map"] is None


# --- kirlilik kaplama yuzdesi ---

def _box(class_name, bbox, confidence=0.9):
    return {"class": class_name, "confidence": confidence, "bbox": bbox}


def test_coverage_is_zero_without_detections():
    assert analysis_service._detection_coverage_percentage([], "pollution", 512) == 0.0


def test_coverage_measures_the_box_area():
    """256x256 kutu, 512x512 goruntunun dortte birini kaplar."""
    detections = [_box("pollution", [0, 0, 256, 256])]

    assert analysis_service._detection_coverage_percentage(
        detections, "pollution", 512
    ) == 25.0


def test_overlapping_boxes_are_counted_once():
    """Kutu alanlari toplansaydi %50 cikardi; maske sayesinde %25 kaliyor."""
    detections = [
        _box("pollution", [0, 0, 256, 256]),
        _box("pollution", [0, 0, 256, 256]),
    ]

    assert analysis_service._detection_coverage_percentage(
        detections, "pollution", 512
    ) == 25.0


def test_coverage_only_counts_the_requested_class():
    detections = [
        _box("pollution", [0, 0, 256, 256]),
        _box("fire", [256, 256, 512, 512]),
    ]

    assert analysis_service._detection_coverage_percentage(
        detections, "pollution", 512
    ) == 25.0


def test_boxes_outside_the_frame_are_clipped():
    """Tasmis kutu %100'u asmamali."""
    detections = [_box("pollution", [-200, -200, 900, 900])]

    assert analysis_service._detection_coverage_percentage(
        detections, "pollution", 512
    ) == 100.0


def test_malformed_boxes_are_skipped():
    detections = [_box("pollution", [1, 2]), _box("pollution", [10, 10, 10, 10])]

    assert analysis_service._detection_coverage_percentage(
        detections, "pollution", 512
    ) == 0.0


def test_pollution_block_reports_measurements(monkeypatch, tmp_path):
    rgb, ndvi = tmp_path / "rgb.png", tmp_path / "ndvi.png"
    rgb.write_bytes(b"x")
    ndvi.write_bytes(b"x")

    monkeypatch.setattr(
        analysis_service,
        "download_satellite_series",
        lambda **kwargs: [
            {
                "year": 2025,
                "status": "ok",
                "path": str(rgb),
                "image_path": str(rgb),
                "rgb_path": str(rgb),
                "ndvi_path": str(ndvi),
            }
        ],
    )
    monkeypatch.setattr(
        analysis_service.YoloService,
        "predict",
        classmethod(
            lambda cls, path: {
                "boxes": [
                    {"class": "pollution", "class_id": 1, "confidence": 0.64, "bbox": [0, 0, 256, 256]},
                ],
                "model_loaded": True,
            }
        ),
    )
    monkeypatch.setattr(analysis_service, "_safe_ndvi", lambda path: None)

    result = analysis_service.analyze_region(36.853, 28.2715)

    assert result["pollution_percentage"] == 25.0
    assert result["ai_results"]["pollution"] == {
        "detected": True,
        "coverage_percentage": 25.0,
        "detection_count": 1,
        "max_confidence": 0.64,
    }


def test_pollution_percentage_is_zero_in_demo_mode(monkeypatch):
    monkeypatch.setattr(
        analysis_service,
        "download_satellite_series",
        lambda **kwargs: [
            {
                "year": 2025,
                "status": "demo",
                "path": None,
                "image_path": None,
                "rgb_path": None,
                "ndvi_path": None,
            }
        ],
    )

    result = analysis_service.analyze_region(36.853, 28.2715)

    assert result["pollution_percentage"] == 0.0
    assert result["ai_results"]["pollution"]["detected"] is False
