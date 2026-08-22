import json
import os
import sys
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal, Optional

import redis
import uvicorn
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

# utils ve services klasörlerindeki bağımlılıklar
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from services.analysis_service import analyze_region as analyze_region_service
from services.satellite_api import (
    cached_image_path,
    change_map_path,
    get_latest_image,
)
from utils.index import get_db_connection, init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    # on_event("startup") FastAPI'de kullanimdan kaldirilmak uzere
    init_db()
    yield


app = FastAPI(
    title="GeoMorphosis AI Engine",
    description="Coğrafi Çevre İzleme ve Erken Uyarı Sistemi - Yapay Zeka Katmanı",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Redis bağlantısı (Node.js Worker ile haberleşmek için).
# Host sabit 'redis' olarak yazılıydı; docker dışında (README'deki uvicorn akışı)
# bağlanamıyordu. decode_responses=True sayesinde veriler string olarak gelir.
REDIS_HOST = os.environ.get("REDIS_HOST", "localhost")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))

r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0, decode_responses=True)

# Güncellenmiş Request Modeli (Haritada kısıtlanan alan bbox ve geoJson parametreleri eklendi)
class AnalyzeRequest(BaseModel):
    start_points: list
    end_points: list = []
    buffer_meters: int = 1000
    years: Optional[list[int]] = None
    region_name: Optional[str] = None
    user_id: Optional[str] = None
    # Haritada kisitlanan alan. Asagidaki dogrulama bu alani okuyordu ama
    # model'de tanimli olmadigi icin Pydantic gonderilen bbox'i dusuruyordu
    # ve kontrol hicbir zaman calismiyordu.
    bbox: Optional[dict] = None


# Worker'ın (mutfak) çağırdığı iç analiz isteği
class InternalAnalyzeRequest(BaseModel):
    lat: float
    lon: float
    buffer_meters: int = 1000
    years: Optional[list[int]] = None
    region_name: Optional[str] = None
    ip_address: Optional[str] = None

class SubscribeRequest(BaseModel):
    email: str
    region_id: str
    notification_type: str = "email"


def _extract_lat_lon(point: dict) -> tuple[float, float]:
    """Frontend farklı isimlendirmelerle nokta gönderebiliyor (lng/lon/longitude)."""
    lat = point.get("lat") or point.get("latitude")
    lon = point.get("lon") or point.get("lng") or point.get("longitude")

    if lat is None or lon is None:
        raise HTTPException(
            status_code=400,
            detail="start_points içindeki ilk nokta lat ve lon içermeli",
        )

    return float(lat), float(lon)


def _persist_analysis(result: dict, ip_address: Optional[str]) -> Optional[int]:
    """Analiz sonucunu regions_analysis tablosuna yazar, satır id'sini döner.

    Tablo utils/index.py içinde tanımlıydı ama hiçbir yerde kullanılmıyordu;
    periodic_subscriptions.region_id bu kayda bağlanıyor.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO regions_analysis
                (ip_address, image_no, region_name, coordinates, ai_results)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                ip_address,
                str(len(result.get("downloaded", []))),
                result.get("region_name"),
                json.dumps(result.get("coordinates", {})),
                json.dumps(result.get("ai_results", {}), ensure_ascii=False),
            ),
        )
        conn.commit()
        region_id = cursor.lastrowid
        conn.close()
        return region_id
    except Exception as e:
        # Kayıt tutulamaması analizin kendisini geçersiz kılmamalı
        print(f"Analiz sonucu veritabanina yazilamadi: {e}")
        return None


@app.get("/")
def read_root():
    return {"status": "active", "service": "GeoMorphosis AI Engine Ready"}


@app.post("/api/analyze")
def queue_analysis(request: AnalyzeRequest):
    """Vezne: analizi kuyruğa alır ve fiş numarasını (task_id) döner."""
    try:
        # 1. Kısıtlanan alan (bbox) kontrolü ve doğrulaması
        if request.bbox:
            min_lat = request.bbox.get("minLat")
            max_lat = request.bbox.get("maxLat")
            min_lng = request.bbox.get("minLng")
            max_lng = request.bbox.get("maxLng")

            if min_lat is not None and max_lat is not None and min_lng is not None and max_lng is not None:
                if min_lat >= max_lat or min_lng >= max_lng:
                    raise HTTPException(status_code=400, detail="Geçersiz kısıtlanmış alan koordinatları (bbox).")

        # Boş bir start_points listesi kabul edilmez
        if not request.start_points:
            raise HTTPException(status_code=400, detail="Başlangıç noktaları gerekli ve boş olmamalı")

        lat, lon = _extract_lat_lon(request.start_points[0])

        task_id = uuid.uuid4().hex
        task_payload = {
            "lat": lat,
            "lon": lon,
            "start_points": request.start_points,
            "end_points": request.end_points,
            "buffer_meters": request.buffer_meters,
            "years": request.years or [],
            "region_name": request.region_name,
            "user_id": request.user_id,
        }

        r.hset(f"task:{task_id}", mapping={
            "status": "pending",
            "payload": json.dumps(task_payload),
            "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        })
        r.rpush("taskQueue", task_id)

        return {"task_id": task_id, "message": "Görev kuyruğa eklendi"}
    except HTTPException:
        raise
    except redis.RedisError as e:
        raise HTTPException(status_code=503, detail=f"Kuyruk servisine ulaşılamadı: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Eski yol geriye dönük uyumluluk için korunuyor
@app.post("/analyze")
def analyze_region(request: AnalyzeRequest):
    return queue_analysis(request)
# --- DURUM SORGULAMA ENDPOINT'İ ---
@app.get("/api/status/{task_id}")
def get_status(task_id: str):
    task = r.hgetall(f"task:{task_id}")

    if not task:
        raise HTTPException(status_code=404, detail="Görev bulunamadı")

    # Görev tamamlandıysa Worker'dan gelen stringified JSON result'u objeye çevir
    if task.get("status") == "completed" and "result" in task:
        try:
            task["result"] = json.loads(task["result"])
        except json.JSONDecodeError:
            task["status"] = "failed"
            task["error"] = "Sonuç çözümlenemedi"

    return task


# --- MUTFAĞIN ÇAĞIRDIĞI SENKRON ANALİZ ---
# Node.js Worker kuyruktan aldığı görevi burada işletir; model bu istekte çalışır.
# Docker ağı içinde kalır, dışarıya açılmaz.
@app.post("/internal/analyze")
def internal_analyze(request: InternalAnalyzeRequest, req: Request):
    try:
        result = analyze_region_service(
            lat=request.lat,
            lon=request.lon,
            buffer_meters=request.buffer_meters,
            years=request.years or None,
            region_name=request.region_name,
        )

        ip_address = request.ip_address or (req.client.host if req.client else None)
        region_id = _persist_analysis(result, ip_address)
        result["region_id"] = region_id

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- ANALIZ GORUNTULERI ---
# Arayuzdeki once/sonra karsilastirmasi ve degisim haritasi bu endpoint'ten besleniyor.
# Onbellek dosyalari zaten her analizde uretiliyor; burada yalnizca sunuluyorlar.
@app.get("/images")
def get_analysis_image(
    lat: float = Query(...),
    lon: float = Query(...),
    kind: Literal["rgb", "ndvi", "diff"] = Query(...),
    year: Optional[int] = Query(default=None),
):
    """Bir bolgenin onbellekteki uydu karosunu veya degisim haritasini doner.

    Dosya adi ISTEMCIDEN ALINMIYOR; lat/lon/year/kind parametrelerinden
    sunucu tarafinda uretiliyor. Boylece dizin gezinme (path traversal)
    yuzeyi hic olusmuyor.
    """
    if kind == "diff":
        path = change_map_path(lat, lon)
    else:
        if year is None:
            raise HTTPException(status_code=400, detail="rgb ve ndvi icin year gerekli")
        path = cached_image_path(lat, lon, year, kind)

    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Goruntu bulunamadi")

    return FileResponse(
        path,
        media_type="image/png",
        # Ayni goruntu polling sirasinda tekrar tekrar inmesin
        headers={"Cache-Control": "public, max-age=3600"},
    )


# Mevcut satellite endpoint'ini bozmadan koruyoruz
@app.get("/satellite/latest")
def latest_satellite(
    lat: Optional[float] = Query(default=None),
    lon: Optional[float] = Query(default=None),
    buffer_meters: int = 1000,
):
    if lat is None or lon is None:
        return {
            "demo": True,
            "message": (
                "lat ve lon parametreleri gerekli. Ornek:"
                " /satellite/latest?lat=39.18&lon=37.34"
            ),
        }
    try:
        result = get_latest_image(lat, lon, buffer_meters)
        if result is None:
            return {
                "demo": True,
                "message": "Uygun goruntu bulunamadi",
                "lat": lat,
                "lon": lon,
            }
        return result
    except Exception as e:
        return {"demo": True, "message": str(e), "lat": lat, "lon": lon}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
