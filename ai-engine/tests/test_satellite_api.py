"""satellite_api buffer guvenlik kilidi testleri."""

from services.satellite_api import (
    MAX_BUFFER_METERS,
    MIN_BUFFER_METERS,
    _clamp_buffer,
)


def test_clamp_buffer_accepts_normal_values():
    assert _clamp_buffer(1000) == 1000
    assert _clamp_buffer(2821) == 2821


def test_clamp_buffer_caps_huge_client_input():
    assert _clamp_buffer(999_999) == MAX_BUFFER_METERS


def test_clamp_buffer_floors_tiny_values():
    assert _clamp_buffer(1) == MIN_BUFFER_METERS


def test_clamp_buffer_handles_garbage():
    assert _clamp_buffer(None) == 1000
    assert _clamp_buffer("abc") == 1000


def test_scale_maiac_aod_applies_catalog_scale():
    """GEE ham degeri x0.001 olceklenmeli; yoksa her bolge 'yuksek' cikar."""
    from services.satellite_api import _scale_maiac_aod

    assert _scale_maiac_aod(120) == 0.12
    assert _scale_maiac_aod(550) == 0.55
    assert _scale_maiac_aod(45.5) == 0.0455
