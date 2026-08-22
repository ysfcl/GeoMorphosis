# GeoMorphosis

> Uydu goruntusu ile yapay zeka destekli cevresel monitoring ve erken uyari platformu.

## Proje Hakkinda

GeoMorphosis, kullaniciin harita uzerinden sectigi bolgelerde yangin, kirlilik, agaclarin azalmasi ve cevresel degisimleri yapay zeka ile analiz eden, otomatik bildirimler gonderen ve PDF rapor ureten bir web platformudur.

## Mimari

```
GeoMorphosis/
├── frontend/      # Next.js + TailwindCSS + Leaflet
├── ai-engine/     # Python FastAPI + YOLOv8 + Rasterio (Vezne)
├── worker/        # Node.js kuyruk tuketicisi (Mutfak)
└── data/          # SQLite veritabani ve uydu goruntusu onbellegi
```

### Analiz akisi

```
Tarayici                Frontend (Next.js)      AI Engine (FastAPI)     Worker (Node)
   |                          |                        |                      |
   |-- bolge ciz + baslat --> |                        |                      |
   |                          |-- POST /api/analyze -->|                      |
   |                          |                        |-- Redis taskQueue -->|
   |<---- task_id ------------|<---- task_id ----------|                      |
   |                          |                        |                      |
   |                          |                        |<-- POST /internal/analyze
   |                          |                        |    (uydu indir + YOLO + NDVI)
   |                          |                        |--- sonuc ----------->|
   |                          |                        |    Redis: completed  |
   |-- 3sn'de bir polling --> |-- GET /api/status/id ->|                      |
   |<---- analiz sonucu ------|                        |                      |
```

Model **worker'in cagirdigi `/internal/analyze` icinde** calisir. Worker kendisi
analiz yapmaz; kuyrugu tuketir, AI Engine'i cagirir, sonucu Redis'e yazar ve
erken uyari e-postasini gonderir.

## Gereksinimler

- **Node.js** >= 18
- **Python** >= 3.11
- **Docker** >= 24.0 (opsiyonel)

## Hizli Baslangic

### 1. Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev
```

Uygulama `http://localhost:3000` adresinde calisir.

### 2. AI Engine (Python FastAPI)

```bash
cd ai-engine
python -m venv venv
source venv/Scripts/activate        # Windows
# source venv/bin/activate   # Linux/Mac
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

API `http://localhost:8000` adresinde calisir.

### 3. Worker (Node.js)

Worker, Redis kuyrugunu dinler ve AI Engine'i cagirir; ikisi de ayakta olmali.

```bash
cd worker
npm install
REDIS_HOST=localhost AI_ENGINE_URL=http://localhost:8000 npm start
```


## Geliştirme ortamında çalıştırmak 
Geliştirme ortamında hızlıca çalıştırmak ve değişiklikler yapmak için:


### Hızlı başlatma (venv/node_modülleri zaten kuruluysa)
`.\dev-start.ps1` 
veya `.\dev-start.sh` 

### İndirirek başlatma (venv oluşturur, python ve node bağımlılıkları kurar)
`.\dev-start.ps1 -Install`
veya `.\dev-start.sh -Install`



## Docker ile Calistirma

Tum zinciri (frontend + ai-engine + worker + redis) birlikte ayaga kaldirmanin
en kolay yolu:

```bash
# Ornek env dosyasini kopyala
cp .env.example .env

# .env dosyasini duzenle (API anahtarlari)

# Tum servisleri baslat
docker-compose up --build
```

## Test etme

### ai-engine (Python)

```bash
cd ai-engine && python -m pytest -q tests/
```

### worker (Node)

```bash
cd worker && npm install && node --test
```

### frontend

```bash
cd frontend && npm run test
```

## npm Komutlari (Frontend)

| Komut | Aciklama |
|-------|----------|
| `npm install` | Bagimliliklari yukler |
| `npm run dev` | Gelistirme sunucusu baslatir |
| `npm run build` | Uretim derlemesi yapar |
| `npm start` | Uretim sunucusu baslatir |
| `npm run lint` | Kod denetimi yapar |

## Ortam Degiskenleri

Iki adet ornek dosya var:

- Kok dizindeki `.env.example` -> `docker-compose` tarafindan okunur
- `frontend/.env.example` -> Next.js tarafindan okunur

Ikisini de `.env` olarak kopyalayin ve doldurun.

| Degisken | Aciklama |
|----------|----------|
| `COPERNICUS_CLIENT_ID` | Copernicus API kimligi |
| `COPERNICUS_CLIENT_SECRET` | Copernicus API sifresi |
| `NASA_FIRMS_API_KEY` | NASA FIRMS API anahtari |
| `SMTP_USER` | E-posta gonderici adresi |
| `SMTP_PASS` | E-posta uygulama sifresi |
| `ALERT_EMAIL_TO` | Erken uyari e-postasinin alicisi (bos ise `SMTP_USER`) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot anahtari |
| `TELEGRAM_CHAT_ID` | Varsayilan Telegram alicisi |
| `MODEL_PATH` | YOLO agirlik dosyasi yolu (bos ise otomatik aranir) |
| `YOLO_CONF_THRESHOLD` | Nesne tespiti guven esigi (varsayilan `0.25`) |
| `REDIS_HOST` / `REDIS_PORT` | Kuyruk sunucusu (docker disinda `localhost`) |
| `AI_ENGINE_URL` | Worker'in cagiracagi AI Engine adresi |
| `ANALYSIS_TIMEOUT_MS` | Uydu indirme + YOLO ust siniri (varsayilan `180000`) |
| `GEOMORPHOSIS_DATA_DIR` | AI Engine veritabani/onbellek klasoru (docker disinda paylasim icin) |

### Model agirligi

`MODEL_PATH` bos birakilirsa su sira ile aranir:

1. `ai-engine/models/fire_yolov8_v2.pt`
2. `ai-engine/models/fire_yolov8.pt`
3. `ai-engine/yolov8n.pt`

Hicbiri bulunamazsa sistem **cokmez**; nesne tespiti atlanir, risk degerleri
yalnizca NDVI degisimine dayanir ve sonuc `model_loaded: false` ile isaretlenir.
Agirlik dosyalari `.gitignore`'da oldugu icin repo ile birlikte gelmez.


## API Endpoints

### AI Engine (`http://localhost:8000`)

| Method | Endpoint | Aciklama |
|--------|----------|----------|
| POST | `/api/analyze` | Analizi kuyruga alir, `task_id` doner |
| GET | `/api/status/{task_id}` | Gorev durumunu doner (`pending`/`processing`/`completed`/`failed`) |
| POST | `/internal/analyze` | Modeli senkron calistirir (worker kullanir, disariya acilmaz) |
| GET | `/satellite/latest` | Bolgenin en guncel uydu goruntusunu doner |

### Frontend (`http://localhost:3000`)

| Method | Endpoint | Aciklama |
|--------|----------|----------|
| POST | `/api/analyze` | Analizi baslatir (AI Engine'e vekalet eder) |
| GET | `/api/analyze?task_id=` | Analiz durumunu sorgular |
| POST | `/api/subscribe` | Bildirim aboneligi olusturur |
| POST | `/api/notify` | Telegram bildirimi gonderir |
| POST | `/api/notify/email` | E-posta bildirimi gonderir |

### Analiz sonucu sozlesmesi

`completed` durumundaki `result` alani hem frontend'in dogrudan okudugu duz
alanlari hem detayli blogu icerir:

```jsonc
{
  "status": "Analiz tamamlandı",
  "timestamp": "2026-08-08T12:00:00Z",
  "region_name": "36.8530, 28.2715",
  "ndvi_score": 0.61,
  "fire_risk": "orta",          // yok | dusuk | orta | yuksek
  "pollution_level": "dusuk",
  "demo_mode": false,
  "model_loaded": true,
  "region_id": 12,
  "ai_results": {
    "yolo_detections": [{ "class": "fire", "confidence": 0.82, "bbox": [] }],
    "environmental_metrics": { "ndvi_t1_mean": 0.0, "ndvi_t2_mean": 0.0, "ndvi_change": 0.0 },
    "change_detection": { "deforestation": {}, "lake_shrinkage": {} }
  },
  "downloaded": []
}
```

## Teknolojiler

- **Frontend:** Next.js 14, React 18, TailwindCSS 3, Leaflet, Bootstrap 5
- **AI Engine:** Python, FastAPI, YOLOv8, OpenCV, Rasterio
- **Worker:** Node.js, node-cron, Nodemailer
- **Veritabani:** SQLite
- **Container:** Docker, Docker Compose

## Lisans

MIT
