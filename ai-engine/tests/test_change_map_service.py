import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.change_map_service import (
    ALPHA_MIN,
    GAIN_BGRA,
    LOSS_BGRA,
    CHANGE_THRESHOLD,
    build_change_rgba,
    render_ndvi_change_map,
)


def _scene():
    """3x1'lik yapay sahne: kayip / degisimsiz / artis."""
    t1 = np.array([[0.80, 0.50, 0.20]], dtype="float32")
    t2 = np.array([[0.20, 0.50, 0.80]], dtype="float32")
    return t1, t2


def test_vegetation_loss_is_painted_red():
    rgba = build_change_rgba(*_scene())

    assert tuple(rgba[0, 0][:3]) == LOSS_BGRA[:3]


def test_vegetation_gain_is_painted_green():
    rgba = build_change_rgba(*_scene())

    assert tuple(rgba[0, 2][:3]) == GAIN_BGRA[:3]


def test_unchanged_pixels_stay_transparent():
    rgba = build_change_rgba(*_scene())

    assert rgba[0, 1][3] == 0


def test_changed_pixels_are_opaque():
    rgba = build_change_rgba(*_scene())

    assert rgba[0, 0][3] >= ALPHA_MIN
    assert rgba[0, 2][3] >= ALPHA_MIN


def test_noise_below_the_threshold_is_ignored():
    """Esik altindaki kucuk dalgalanma tum kareyi renklendirmemeli."""
    t1 = np.full((4, 4), 0.50, dtype="float32")
    t2 = np.full((4, 4), 0.50 + CHANGE_THRESHOLD / 2, dtype="float32")

    rgba = build_change_rgba(t1, t2)

    assert rgba[..., 3].max() == 0


def test_stronger_change_is_more_opaque():
    t1 = np.array([[0.50, 0.50]], dtype="float32")
    t2 = np.array([[0.35, 0.05]], dtype="float32")

    rgba = build_change_rgba(t1, t2)

    assert rgba[0, 1][3] > rgba[0, 0][3]


def test_mismatched_shapes_are_rejected():
    with pytest.raises(ValueError):
        build_change_rgba(np.zeros((4, 4)), np.zeros((5, 5)))


def test_render_writes_a_png(tmp_path):
    out = tmp_path / "diff.png"

    result = render_ndvi_change_map(*_scene(), str(out))

    assert result == str(out)
    assert out.exists() and out.stat().st_size > 0


def test_render_returns_none_instead_of_raising(tmp_path):
    """Harita uretilemezse analiz cokmemeli."""
    result = render_ndvi_change_map(
        np.zeros((4, 4)), np.zeros((5, 5)), str(tmp_path / "x.png")
    )

    assert result is None
