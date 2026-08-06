import uvicorn
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import json
import sys
import os
import redis
import uuid

# utils klasöründeki veritabanı fonksiyonlarımıza erişmek için yol ayarı
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from utils.index import init_db, get_db_connection
from services.satellite_api import download_satellite_series, get_latest_image

# FastAPI uygulamasını başlat
app = FastAPI(
    title="GeoMorphosis AI Engine",
    description="Coğrafi Çevre İzleme ve Erken Uyarı Sistemi - Yapay Zeka Katmanı",
    version="1.0.0"
)

# Next.js frontend'inden gelecek isteklere izin vermek için CORS ayarları
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Geliştirme aşamasında tüm kaynaklara izin veriyoruz
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Redis bağlantısı (Docker üzerinden, Node.js Worker ile haberleşmek için)
# decode_responses=True sayesinde veriler byte yerine string olarak gelir
r = redis.Redis(host='redis', port=6379, db=0, decode_responses=True)

# Güncellenmiş Request Modeli (Frontend ekibinin kullanacağı start ve end pointler eklendi)
class AnalyzeRequest(BaseModel):
    start_points: list
    end_points: list
    buffer_meters: int = 1000
    years: Optional[list[int]] = None

class SubscribeRequest(BaseModel):
    email: str
    region_id: str
    notification_type: str = "email"

# Uygulama ayağa kalktığında veritabanı tablolarının hazır olduğundan emin ol
@app.on_event("startup")
def startup_event():
    init_db()

@app.get("/")
def read_root():
    return {"status": "active", "service": "GeoMorphosis AI Engine Ready"}

# --- VEZNE (RECEPTION) ENDPOINT'İ ---
# Frontend sadece buraya istek atıp bir fiş numarası (task_id) alacak.
@app.post("/api/analyze")
def analyze_region(request: AnalyzeRequest, req: Request):
    try:
        ip_address = req.client.host if req.client else "unknown"
        task_id = str(uuid.uuid4())

        # Worker'a (Mutfak) gidecek veriyi hazırlıyoruz
        task_data = {
            "start_points": request.start_points,
            "end_points": request.end_points,
            "buffer_meters": request.buffer_meters,
            "years": request.years,
            "ip_address": ip_address
        }

        # 1. Görevi Redis'e kaydet (pending durumu ile)
        r.hset(f"task:{task_id}", mapping={
            "status": "pending",
            "data": json.dumps(task_data)
        })

        # 2. Görevi Mutfak kuyruğuna (taskQueue) it
        r.lpush("taskQueue", task_id)

        # Not: Eskiden veritabanı kaydı (sqlite) burada eşzamanlı yapılıyordu. 
        # Artık bu işlem Node.js tarafında veya ayrı bir sonuç okuyucu serviste yapılmalı.

        return {
            "task_id": task_id,
            "message": "Analiz sıraya alındı, mutfakta işleniyor."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- DURUM SORGULAMA ENDPOINT'İ ---
# Frontend'in polling (sürekli sorgulama) yaparak analiz sonucunu alacağı yer.
@app.get("/api/status/{task_id}")
def get_status(task_id: str):
    task = r.hgetall(f"task:{task_id}")

    if not task:
        raise HTTPException(status_code=404, detail="Görev bulunamadı")

    # Eğer görev tamamlanmışsa Node.js Worker'dan gelen stringified JSON result'u objeye çevir
    if task.get("status") == "completed" and "result" in task:
        task["result"] = json.loads(task["result"])

    return task


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
            "message": "lat ve lon parametreleri gerekli. Ornek: /satellite/latest?lat=39.18&lon=37.34",
        }
    try:
        result = get_latest_image(lat, lon, buffer_meters)
        if result is None:
            return {"demo": True, "message": "Uygun goruntu bulunamadi", "lat": lat, "lon": lon}
        return result
    except Exception as e:
        return {"demo": True, "message": str(e), "lat": lat, "lon": lon}


if __name__ == "__main__":
    # Sunucuyu 8000 portunda başlat
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)