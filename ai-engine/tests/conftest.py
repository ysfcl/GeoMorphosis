"""Test suitesini hermetik yapar: hicbir test gercek GEE/ag cagrisi yapmaz.

Earth Engine kimlik bilgisi olmayan ortamlarda ee.Initialize yavas
dusuyor (30-40 sn retry); conftest bunu en basta kapatarak testleri
hizli ve deterministik tutuyor. AOD/indirme fonksiyonlari
_ee_available bayragina baktigi icin ekstra mock gerekmez.
"""

import sys
from pathlib import Path

import pytest

AI_ENGINE_DIR = Path(__file__).resolve().parent.parent
if str(AI_ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_ENGINE_DIR))


@pytest.fixture(autouse=True)
def _disable_earth_engine(monkeypatch):
    from services import satellite_api

    satellite_api._ee_initialized = True
    satellite_api._ee_available = False
    yield
