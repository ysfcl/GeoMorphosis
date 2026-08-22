"""AI Engine HTTP katmani icin entegrasyon testleri.

TestClient httpx gerektirir; kurulu degilse testler atlanir
(`pip install httpx`).
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

pytest.importorskip("httpx", reason="fastapi.testclient httpx gerektiriyor")

from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture
def client(tmp_path, monkeypatch):
    # Testler gercek veritabanina dokunmasin
    monkeypatch.setenv("GEOMORPHOSIS_DATA_DIR", str(tmp_path))

    import utils.index as db_utils

    monkeypatch.setattr(db_utils, "DATA_DIR", str(tmp_path))
    monkeypatch.setattr(db_utils, "DB_PATH", str(tmp_path / "geopulse.db"))

    import main

    with TestClient(main.app) as test_client:
        yield test_client


def test_root_reports_service_is_active(client):
    response = client.get("/")

    assert response.status_code == 200
    assert response.json()["status"] == "active"


def test_internal_analyze_returns_the_full_contract(client):
    """Worker bu endpointi cagiriyor; frontend'in okudugu duz alanlar
    uydu verisi olmadan da dolu gelmeli."""
    response = client.post(
        "/internal/analyze",
        json={"lat": 36.853, "lon": 28.2715, "buffer_meters": 1000},
    )

    assert response.status_code == 200
    body = response.json()

    for key in (
        "status",
        "timestamp",
        "region_name",
        "ndvi_score",
        "fire_risk",
        "pollution_level",
        "demo_mode",
        "model_loaded",
        "ai_results",
    ):
        assert key in body, f"sozlesmede eksik alan: {key}"

    assert body["fire_risk"] in ("yok", "dusuk", "orta", "yuksek")
    assert body["pollution_level"] in ("yok", "dusuk", "orta", "yuksek")
    assert body["region_name"] == "36.8530, 28.2715"


def test_internal_analyze_persists_the_result(client):
    response = client.post(
        "/internal/analyze",
        json={"lat": 40.1885, "lon": 29.061, "region_name": "Bursa"},
    )

    assert response.status_code == 200
    assert response.json()["region_id"] is not None


def test_queue_endpoint_rejects_a_point_without_coordinates(client):
    response = client.post(
        "/api/analyze",
        json={"start_points": [{"foo": 1}], "end_points": []},
    )

    assert response.status_code == 400


def test_queue_endpoint_rejects_an_empty_point_list(client):
    response = client.post("/api/analyze", json={"start_points": [], "end_points": []})

    assert response.status_code == 400


def test_queue_endpoint_reports_an_unreachable_queue(client, monkeypatch):
    """Redis kapaliysa 500 yerine anlasilir bir 503 donmeli."""
    import redis

    import main

    def raise_redis_error(*args, **kwargs):
        raise redis.RedisError("baglanti yok")

    monkeypatch.setattr(main.r, "hset", raise_redis_error)

    response = client.post(
        "/api/analyze",
        json={"start_points": [{"lat": 36.853, "lng": 28.2715}], "end_points": []},
    )

    assert response.status_code == 503


def test_status_endpoint_returns_404_for_unknown_task(client, monkeypatch):
    import main

    monkeypatch.setattr(main.r, "hgetall", lambda key: {})

    response = client.get("/api/status/bilinmeyen")

    assert response.status_code == 404


def test_status_endpoint_parses_the_completed_result(client, monkeypatch):
    import main

    monkeypatch.setattr(
        main.r,
        "hgetall",
        lambda key: {"status": "completed", "result": '{"fire_risk": "orta"}'},
    )

    response = client.get("/api/status/abc")

    assert response.status_code == 200
    assert response.json()["result"] == {"fire_risk": "orta"}


def test_status_endpoint_marks_unparsable_result_as_failed(client, monkeypatch):
    import main

    monkeypatch.setattr(
        main.r,
        "hgetall",
        lambda key: {"status": "completed", "result": "{bozuk-json"},
    )

    response = client.get("/api/status/abc")

    assert response.status_code == 200
    assert response.json()["status"] == "failed"


def test_queue_endpoint_rejects_an_invalid_bbox(client):
    """bbox dogrulamasi AnalyzeRequest'te alan tanimli olmadigi icin hic
    calismiyordu; getattr her zaman None donuyordu."""
    response = client.post(
        "/api/analyze",
        json={
            "start_points": [{"lat": 36.853, "lng": 28.2715}],
            "end_points": [],
            "bbox": {"minLat": 40.0, "maxLat": 36.0, "minLng": 28.0, "maxLng": 29.0},
        },
    )

    assert response.status_code == 400
    assert "bbox" in response.json()["detail"].lower()


def test_queue_endpoint_accepts_a_valid_bbox(client, monkeypatch):
    """Gecerli bbox dogrulamayi gecip kuyruga ulasmali."""
    import main

    seen = {}

    def fake_hset(key, mapping):
        seen["key"] = key
        return 1

    monkeypatch.setattr(main.r, "hset", fake_hset)
    monkeypatch.setattr(main.r, "rpush", lambda *a, **k: 1)

    response = client.post(
        "/api/analyze",
        json={
            "start_points": [{"lat": 36.853, "lng": 28.2715}],
            "end_points": [],
            "bbox": {"minLat": 36.0, "maxLat": 40.0, "minLng": 28.0, "maxLng": 29.0},
        },
    )

    assert response.status_code == 200
    assert response.json()["task_id"]
    assert seen["key"].startswith("task:")


# --- /images ---

def _write_cached_png(tmp_path, name):
    import numpy as np
    import cv2

    path = tmp_path / name
    cv2.imwrite(str(path), np.zeros((8, 8, 3), dtype="uint8"))
    return path


def test_images_returns_the_cached_tile(client, tmp_path, monkeypatch):
    import services.satellite_api as satellite_api

    monkeypatch.setattr(satellite_api, "_default_cache_dir", lambda: str(tmp_path))
    _write_cached_png(tmp_path, "region_36p8530_28p2715_2020_rgb.png")

    response = client.get(
        "/images", params={"lat": 36.853, "lon": 28.2715, "year": 2020, "kind": "rgb"}
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert "max-age" in response.headers.get("cache-control", "")


def test_images_serves_the_change_map_without_a_year(client, tmp_path, monkeypatch):
    import services.satellite_api as satellite_api

    monkeypatch.setattr(satellite_api, "_default_cache_dir", lambda: str(tmp_path))
    _write_cached_png(tmp_path, "region_36p8530_28p2715_diff.png")

    response = client.get(
        "/images", params={"lat": 36.853, "lon": 28.2715, "kind": "diff"}
    )

    assert response.status_code == 200


def test_images_returns_404_for_a_missing_tile(client, tmp_path, monkeypatch):
    import services.satellite_api as satellite_api

    monkeypatch.setattr(satellite_api, "_default_cache_dir", lambda: str(tmp_path))

    response = client.get(
        "/images", params={"lat": 1.0, "lon": 2.0, "year": 1999, "kind": "rgb"}
    )

    assert response.status_code == 404


def test_images_requires_a_year_for_yearly_tiles(client):
    response = client.get("/images", params={"lat": 1.0, "lon": 2.0, "kind": "ndvi"})

    assert response.status_code == 400


def test_images_rejects_an_unknown_kind(client):
    """kind bir dosya yolu degil, kapali bir liste; path traversal denemesi
    endpoint'e hic ulasmiyor."""
    response = client.get(
        "/images",
        params={"lat": 1.0, "lon": 2.0, "year": 2020, "kind": "../../etc/passwd"},
    )

    assert response.status_code == 422
