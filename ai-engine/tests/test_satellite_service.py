import importlib
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.fixture
def satellite_module(monkeypatch):
    monkeypatch.setenv("GOOGLE_EARTH_ENGINE_CREDENTIALS", "")
    module = importlib.import_module("services.satellite_api")
    importlib.reload(module)
    return module


def test_mock_satellite_results_builds_demo_entries(satellite_module):
    results = satellite_module._mock_satellite_results(36.85, 28.27, [2020, 2023])

    assert len(results) == 2
    assert results[0]["year"] == 2020
    assert results[0]["status"] == "demo"
    assert results[0]["path"] is None
    assert "36.85" in results[0]["note"]


def test_mock_latest_image_returns_demo_payload(satellite_module):
    payload = satellite_module._mock_latest_image(36.85, 28.27)

    assert payload["demo"] is True
    assert payload["url"] is None
    assert "36.85" in payload["note"]


def test_download_satellite_series_falls_back_to_demo_when_ee_is_unavailable(satellite_module, monkeypatch):
    monkeypatch.setattr(satellite_module, "_ee_available", False)
    monkeypatch.setattr(satellite_module, "_ee_initialized", True)

    results = satellite_module.download_satellite_series(36.85, 28.27, years=[2020, 2023])

    assert len(results) == 2
    assert all(item["status"] == "demo" for item in results)
    assert all(item["path"] is None for item in results)


def test_download_satellite_series_returns_no_data_when_collection_is_empty(satellite_module, monkeypatch):
    class FakeNumber:
        def __init__(self, value):
            self.value = value

        def getInfo(self):
            return self.value

    class FakeGeometry:
        def buffer(self, meters):
            return self

        def bounds(self):
            return self

    class FakeImageCollection:
        def filterBounds(self, roi):
            return self

        def filterDate(self, start_date, end_date):
            return self

        def filter(self, filt):
            return self

        def select(self, bands):
            return self

        def size(self):
            return FakeNumber(0)

    class FakeEE:
        class Geometry:
            @staticmethod
            def Point(lon, lat):
                return FakeGeometry()

        class Filter:
            @staticmethod
            def lt(*args):
                return "filter"

        class ImageCollection:
            def __new__(cls, name):
                return FakeImageCollection()

    monkeypatch.setattr(satellite_module, "_ee_available", True)
    monkeypatch.setattr(satellite_module, "_init_earth_engine", lambda: None)
    monkeypatch.setitem(sys.modules, "ee", FakeEE)

    results = satellite_module.download_satellite_series(36.85, 28.27, years=[2020])

    assert results == [
        {
            "year": 2020,
            "status": "no_data",
            "path": None,
            "image_path": None,
            "rgb_path": None,
            "ndvi_path": None,
        }
    ]


def test_get_latest_image_returns_none_when_collection_is_empty(satellite_module, monkeypatch):
    class FakeNumber:
        def __init__(self, value):
            self.value = value

        def getInfo(self):
            return self.value

    class FakeGeometry:
        def buffer(self, meters):
            return self

        def bounds(self):
            return self

    class FakeImageCollection:
        def filterBounds(self, roi):
            return self

        def filterDate(self, start_date, end_date):
            return self

        def filter(self, filt):
            return self

        def select(self, bands):
            return self

        def sort(self, field, descending):
            return self

        def size(self):
            return FakeNumber(0)

    class FakeEE:
        class Geometry:
            @staticmethod
            def Point(lon, lat):
                return FakeGeometry()

        class Filter:
            @staticmethod
            def lt(*args):
                return "filter"

        class ImageCollection:
            def __new__(cls, name):
                return FakeImageCollection()

    monkeypatch.setattr(satellite_module, "_ee_available", True)
    monkeypatch.setattr(satellite_module, "_init_earth_engine", lambda: None)
    monkeypatch.setitem(sys.modules, "ee", FakeEE)

    assert satellite_module.get_latest_image(36.85, 28.27) is None


def test_download_satellite_series_reports_download_error_when_request_fails(satellite_module, monkeypatch):
    class FakeNumber:
        def __init__(self, value):
            self.value = value

        def getInfo(self):
            return self.value

    class FakeGeometry:
        def buffer(self, meters):
            return self

        def bounds(self):
            return self

    class FakeImage:
        def clip(self, roi):
            return self

        def getThumbURL(self, vis_params):
            return "https://example.com/image.png"

        def date(self):
            return self

        def format(self, fmt):
            return self

        def getInfo(self):
            return "2025-01-15"

    class FakeImageCollection:
        def filterBounds(self, roi):
            return self

        def filterDate(self, start_date, end_date):
            return self

        def filter(self, filt):
            return self

        def select(self, bands):
            return self

        def sort(self, field, descending):
            return self

        def size(self):
            return FakeNumber(1)

        def median(self):
            return FakeImage()

    class FakeEE:
        class Geometry:
            @staticmethod
            def Point(lon, lat):
                return FakeGeometry()

        class Filter:
            @staticmethod
            def lt(*args):
                return "filter"

        class ImageCollection:
            def __new__(cls, name):
                return FakeImageCollection()

    def raise_request_error(*args, **kwargs):
        raise satellite_module.requests.exceptions.RequestException("boom")

    monkeypatch.setattr(satellite_module, "_ee_available", True)
    monkeypatch.setattr(satellite_module, "_init_earth_engine", lambda: None)
    monkeypatch.setattr(satellite_module.requests, "get", raise_request_error)
    monkeypatch.setitem(sys.modules, "ee", FakeEE)

    results = satellite_module.download_satellite_series(36.85, 28.27, years=[2020])

    assert results == [
        {
            "year": 2020,
            "status": "download_error",
            "path": None,
            "image_path": None,
            "rgb_path": None,
            "ndvi_path": None,
        }
    ]


def test_download_satellite_series_returns_rgb_and_ndvi_paths_on_success(
    satellite_module, monkeypatch, tmp_path
):
    """analysis_service, rgb_path ve ndvi_path alanlarina gore filtreledigi icin
    basarili indirmede bu iki alanin dolu olmasi sart."""

    class FakeNumber:
        def __init__(self, value):
            self.value = value

        def getInfo(self):
            return self.value

    class FakeGeometry:
        def buffer(self, meters):
            return self

        def bounds(self):
            return self

    class FakeImage:
        def clip(self, roi):
            return self

        def normalizedDifference(self, bands):
            return self

        def rename(self, name):
            return self

        def getThumbURL(self, vis_params):
            return "https://example.com/image.png"

    class FakeImageCollection:
        def filterBounds(self, roi):
            return self

        def filterDate(self, start_date, end_date):
            return self

        def filter(self, filt):
            return self

        def select(self, bands):
            return self

        def size(self):
            return FakeNumber(1)

        def median(self):
            return FakeImage()

    class FakeEE:
        class Geometry:
            @staticmethod
            def Point(lon, lat):
                return FakeGeometry()

        class Filter:
            @staticmethod
            def lt(*args):
                return "filter"

        class ImageCollection:
            def __new__(cls, name):
                return FakeImageCollection()

    class FakeResponse:
        content = b"png-bytes"

        def raise_for_status(self):
            return None

    monkeypatch.setattr(satellite_module, "_ee_available", True)
    monkeypatch.setattr(satellite_module, "_init_earth_engine", lambda: None)
    monkeypatch.setattr(satellite_module.requests, "get", lambda *a, **k: FakeResponse())
    monkeypatch.setitem(sys.modules, "ee", FakeEE)

    results = satellite_module.download_satellite_series(
        36.85, 28.27, years=[2020], output_dir=str(tmp_path)
    )

    assert len(results) == 1
    entry = results[0]
    assert entry["status"] == "ok"
    assert entry["rgb_path"] and entry["rgb_path"].endswith("_rgb.png")
    assert entry["ndvi_path"] and entry["ndvi_path"].endswith("_ndvi.png")
    assert Path(entry["rgb_path"]).exists()
    assert Path(entry["ndvi_path"]).exists()
