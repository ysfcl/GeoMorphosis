# GeoMorphosis

> Uydu goruntusu ile yapay zeka destekli cevresel monitoring ve erken uyari platformu.

## Proje Hakkinda

GeoMorphosis, kullanicinin harita uzerinden sectigi bolgelerde yangin, kirlilik, agaclarin azalmasi ve cevresel degisimleri yapay zeka ile analiz eden, otomatik bildirimler gonderen ve PDF rapor ureten bir web platformudur.

## Mimari

```
GeoMorphosis/
├── frontend/      # Next.js + TailwindCSS + Leaflet
├── ai-engine/     # Python FastAPI + YOLOv8 + OpenCV
├── worker/        # Node.js cron job - bildirim servisi
└── data/          # SQLite veritabani ve onbellek
```

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
venv/Scripts/activate        # Windows
# source venv/bin/activate   # Linux/Mac
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

API `http://localhost:8000` adresinde calisir.

### 3. Worker (Node.js)

```bash
cd worker
npm install
npm start
```

## Docker ile Calistirma

```bash
# Ornek env dosyasini kopyala
cp .env.example .env

# .env dosyasini duzenle (API anahtarlari)

# Tum servisleri baslat
docker-compose up --build
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

`.env.example` dosyasini `.env` olarak kopyalayin ve asagidaki degiskenleri doldurun:

| Degisken | Aciklama |
|----------|----------|
| `COPERNICUS_CLIENT_ID` | Copernicus API kimligi |
| `COPERNICUS_CLIENT_SECRET` | Copernicus API sifresi |
| `NASA_FIRMS_API_KEY` | NASA FIRMS API anahtari |
| `SMTP_USER` | E-posta gonderici adresi |
| `SMTP_PASS` | E-posta uygulama sifresi |

## API Endpoints

| Method | Endpoint | Aciklama |
|--------|----------|----------|
| POST | `/api/analyze` | Bolge analizi baslatir |
| GET | `/api/analyze?id=` | Bolge detay getirir |
| POST | `/api/subscribe` | Bildirim aboneligi olusturur |

## Teknolojiler

- **Frontend:** Next.js 14, React 18, TailwindCSS 3, Leaflet, Bootstrap 5
- **AI Engine:** Python, FastAPI, YOLOv8, OpenCV, Rasterio
- **Worker:** Node.js, node-cron, Nodemailer
- **Veritabani:** SQLite
- **Container:** Docker, Docker Compose

## Lisans

MIT
