# GeoMorphosis — Proje Devir Tanıtım Dokümanı

> **Doküman Amacı:** Bu dosya, GeoMorphosis projesini devralacak ekibe; projenin amacını, mimarisini, kullanılan teknolojileri, klasör yapısını, çalışma akışını ve ortam kurulumunu detaylıca aktarmak için hazırlanmıştır.
>
> **Hazırlayan:** Senior Manager & Developer (Devir Teslim)
> **Sürüm:** 1.0 — Ağustos 2026

---

## İçindekiler

1. [Proje Özeti ve Amaç](#1-proje-özeti-ve-amaç)
2. [Sistem Mimarisi](#2-sistem-mimarisi)
3. [Klasör Yapısı ve Görevleri](#3-klasör-yapısı-ve-görevleri)
4. [Kullanılan Teknolojiler](#4-kullanılan-teknolojiler)
5. [Uçtan Uca Veri Akışı](#5-uçtan-uca-veri-akışı)
6. [Bileşen Detayları](#6-bileşen-detayları)
7. [API Referansı](#7-api-referansı)
8. [Ortam Değişkenleri ve Konfigürasyon](#8-ortam-değişkenleri-ve-konfigürasyon)
9. [Kurulum ve Çalıştırma](#9-kurulum-ve-çalıştırma)
10. [Test ve Kalite Güvencesi](#10-test-ve-kalite-güvencesi)
11. [Model Yönetimi ve Yeniden Eğitim](#11-model-yönetimi-ve-yeniden-eğitim)
12. [Bilinen Sorunlar ve Devir Notları](#12-bilinen-sorunlar-ve-devir-notları)
13. [Devir Kontrol Listesi ve Önerilen Yol Haritası](#13-devir-kontrol-listesi-ve-önerilen-yol-haritası)

---

## 1. Proje Özeti ve Amaç

**GeoMorphosis**, kullanıcıların harita üzerinde seçtiği bölgelerdeki çevresel değişimleri **uydu görüntüleri** ve **yapay zeka** ile analiz eden bir web platformudur.

### Platformun çözdüğü problem

Çevresel afetler (kirlilik, ormansızlaşma) için profesyonel uydu analizi pahalı ve yavaştır. GeoMorphosis bu analizi otomatikleştirir:

| Yetenek | Açıklama |
|---------|----------|
| **Ormansızlaşma tespiti** | YOLOv8 nesne tespiti + Sentinel-2 NDVI hesabı (t1 vs t2 dönem karşılaştırması) |
| **Kirlilik analizi** | Sentinel-5P AOD (aerosol) verisi + YOLOv8 tespiti |
| **Bitki örtüsü** | Sentinel-2 NDVI skoru ve dönemsel değişim takibi |
| **Göl küçülmesi** | Su yüzeyi değişim tespiti |
| **Erken uyarı** | E-posta (SMTP) ve Telegram bot bildirimleri |
| **PDF raporlama** | Analiz sonuçlarının tarayıcıda PDF olarak dışa aktarılması |

### Hedef kullanıcılar

Belediyeler, orman işletmeleri, çevre müfettişlikleri, araştırma ekipleri — teknik uydu bilgisi gerektirmeden harita üzerinden bölge seçip analiz almak isteyen herkes.

---

## 2. Sistem Mimarisi

Proje **mikroservis mimarisi** kullanır ve kod tabanında tutarlı bir "restoran" metaforu vardır:

```
┌─────────────────────────────────────────────────────────────────────┐
│                            KULLANICI                                │
│              (Haritada bölge çizer, sonucu izler)                   │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────────────────┐
│   FRONTEND — "Vitrine"  (http://localhost:3000)                     │
│   Next.js + TailwindCSS + Leaflet                                   │
│   • Harita arayüzü, bölge çizimi (leaflet-draw)                     │
│   • Sonuç görselleştirme, grafikler, PDF dışa aktarma               │
│   • API route'ları AI Engine'e vekillik eder (proxy)                │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ POST /api/analyze
┌──────────────────────────▼──────────────────────────────────────────┐
│   AI ENGINE — "Vezne"  (http://localhost:8000)                      │
│   Python FastAPI + YOLOv8 + Google Earth Engine                     │
│   • İsteği doğrular, task_id üretir, kuyruğa yazar                  │
│   • Uydu görüntüsü indirir (Sentinel-2/5P, MODIS)                   │
│   • NDVI hesaplar, YOLO ile ormansızlaşma/kirlilik tespiti yapar    │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ Redis taskQueue (RPUSH)
┌──────────────────────────▼──────────────────────────────────────────┐
│   REDIS (http://localhost:6379)                                     │
│   • taskQueue listesi: bekleyen görevler                            │
│   • task:{id} hash'leri: durum (pending/processing/completed/failed)│
└──────────────────────────┬──────────────────────────────────────────┘
                           │ BRPOP taskQueue
┌──────────────────────────▼──────────────────────────────────────────┐
│   WORKER — "Mutfak"  (Node.js)                                      │
│   • Kuyruğu tüketir, AI Engine'in /internal/analyze'unu çağırır     │
│   • Sonucu Redis'e geri yazar                                       │
│   • Erken uyarı e-postasını gönderir (Nodemailer)                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Tasarım kararlarının gerekçeleri

- **Asenkron kuyruk:** Uydu indirme + model çıkarımı 30–180 saniye sürebilir. HTTP isteği bu kadar bekleyemez; istek anında `task_id` döner, sonuç polling ile alınır.
- **Analizin AI Engine'de yaşaması:** Worker sadece "garson"dur — kuyruğu tüketir, AI Engine'i çağırır, sonucu taşır. Model ve tüm ML yükü tek yerde toplanır; worker hafif kalır (sadece `redis` + `nodemailer` bağımlılığı var).
- **Paylaşılan SQLite:** Frontend ve AI Engine aynı `./data` klasörünü volume olarak mount eder; abonelik kayıtları (frontend/Prisma) ve analiz kayıtları (ai-engine) aynı dosyada yaşar.
- **Redis hash tabanlı görev durumu:** `GET /api/status/{task_id}` doğrudan Redis'ten okur; ayrıca bir veritabanı sorgusu gerekmez.

---

## 3. Klasör Yapısı ve Görevleri

```
GeoMorphosis/
├── frontend/                  # Web arayüzü ("Vitrine")
│   ├── src/app/               # Next.js App Router sayfaları
│   │   ├── page.js            # Ana sayfa: Leaflet harita, bölge çizimi
│   │   ├── region/page.js     # Analiz sonuç ekranı (polling + görselleştirme)
│   │   └── api/               # Sunucu tarafı route'ları (AI Engine proxy'si)
│   │       ├── analyze/       # POST: analiz başlat, GET: durum sorgula
│   │       ├── notify/        # Telegram bildirimi gönderme
│   │       └── subscribe/     # Periyodik bildirim aboneliği
│   ├── prisma/schema.prisma   # Abonelik tabloları şeması
│   └── package.json
│
├── ai-engine/                 # Yapay zeka servisi ("Vezne")
│   ├── main.py                # FastAPI uygulaması + endpoint'ler
│   ├── services/              # İş mantığı katmanı
│   │   ├── analysis_service.py      # Ana orkestratör: tüm analizi koordine eder
│   │   ├── satellite_api.py         # Uydu görüntüsü indirme + önbellek (GEE)
│   │   ├── ndvi_service.py          # NDVI hesaplama
│   │   ├── yolo_service.py          # YOLOv8 model yükleyici/tahminci
│   │   ├── change_detection_service.py  # Ormansızlaşma/göl küçülmesi tespiti
│   │   └── change_map_service.py    # Değişim haritası (diff) PNG üretimi
│   ├── utils/
│   │   ├── index.py          # SQLite bağlantısı + init_db()
│   │   ├── data_collector.py # Eğitim verisi toplama (GEE'den)
│   │   ├── auto_labeler.py   # Veri etiketleme yardımcıları
│   │   └── prepare_yolo_dataset.py  # YOLO formatına veri hazırlama
│   ├── train.py               # Model eğitim betiği
│   ├── models/                # Ağırlık dosyaları (.pt) — git'e girmez
│   │   └── best.pt            # Aktif YOLOv8 ağırlığı (deforestation/pollution)
│   ├── geomorphosis-cb3ae273c071.json  # GEE servis hesabı anahtarı (git'e girmez)
│   ├── tests/                 # pytest testleri
│   └── requirements.txt
│
├── worker/                    # Arka plan işçisi ("Mutfak")
│   ├── index.js               # Kuyruk döngüsü: BRPOP → analiz çağrısı → Redis yazımı
│   ├── services/notifier.js   # E-posta/Telegram erken uyarı gönderimi
│   ├── tests/                 # node --test testleri
│   └── package.json           # Sadece redis + nodemailer bağımlılığı
│
├── data/                      # Paylaşılan kalıcılık alanı (git'e girmez)
│   ├── geopulse_clean.db      # SQLite ana veritabanı
│   ├── geopulse_fresh.db      # Temiz başlangıç kopyası
│   └── (ai-engine/data/cache/)  # Uydu karoları, NDVI ve diff PNG'leri
│
├── runs/                      # YOLO eğitim çıktıları (git'e girmez)
├── docker-compose.yml         # 4 servisli tam yığın orkestrasyonu
├── .env.example               # Ortam değişkeni şablonu (docker-compose okur)
├── dev-start.ps1|.sh          # Native hızlı başlatma scriptleri (-Install destekli)
├── dev-stop.ps1|.sh           # Native durdurma scriptleri
├── test-*.bat                 # Windows hızlı test komutları
├── PRD.pdf                    # Ürün gereksinim dokümanı
└── README.md                  # Kurulum özeti
```

---

## 4. Kullanılan Teknolojiler

### Frontend

| Teknoloji | Sürüm | Görevi |
|-----------|-------|--------|
| **Next.js** | 14.x | React framework'ü; App Router, sunucu tarafı API route'ları |
| **React** | 18.x | Bileşen tabanlı UI |
| **TailwindCSS** | 3.4.x | Utility-first stil verme |
| **Bootstrap 5** | 5.3.x | Bazı bileşenlerde hazır stiller (projenin ilk döneminden kalma) |
| **Leaflet** | 1.9.x | İnteraktif harita |
| **leaflet-draw** | 1.0.x | Harita üzerinde poligon/dikdörtgen çizimi |
| **leaflet.heat** | 0.2.x | Risk yoğunluğu ısı haritası |
| **Chart.js + react-chartjs-2** | 4.x / 5.x | NDVI zaman serisi grafikleri |
| **Recharts** | 3.x | Alternatif grafik bileşenleri |
| **jsPDF** | 4.x | Tarayıcıda PDF rapor üretimi |
| **lucide-react** | — | İkon seti |
| **Prisma + @prisma/client + better-sqlite3** | 7.x | ORM; abonelik tabloları için (SQLite adaptörü) |
| **Nodemailer** | — | E-posta bildirimleri |
| **Axios** | — | HTTP istemcisi |
| **ESLint / Vitest** | — | Lint ve test (dev bağımlılıkları) |

### AI Engine

| Teknoloji | Sürüm | Görevi |
|-----------|-------|--------|
| **Python** | >= 3.11 | Çalışma zamanı |
| **FastAPI** | >= 0.111 | REST API framework'ü (async, Pydantic doğrulama, otomatik Swagger docs `/docs`) |
| **Uvicorn** | >= 0.30 | ASGI sunucusu |
| **ultralytics (YOLOv8)** | >= 8.2 | Nesne tespiti: ormansızlaşma ve kirlilik sınıfları |
| **Google Earth Engine (earthengine-api)** | >= 1.7 | Uydu verisi erişimi (Sentinel-2, Sentinel-5P, MODIS); ücretsiz ama servis hesabı gerektirir |
| **Rasterio** | >= 1.4 | GeoTIFF/raster okuma-yazma, NDVI hesabı |
| **OpenCV (headless)** | >= 4.10 | Görüntü ön işleme (YOLO girdi formatı, renk uzayı dönüşümleri) |
| **NumPy** | >= 1.26 | Dizi işlemleri |
| **redis-py** | — | Kuyruk yazma ve durum yönetimi |
| **Pydantic** | >= 2.7 | İstek modelleri ve doğrulama |
| **pytest + httpx** | — | Test altyapısı (`fastapi.testclient` httpx ister) |

### Worker

| Teknoloji | Sürüm | Görevi |
|-----------|-------|--------|
| **Node.js** | >= 18 | Çalışma zamanı (native `fetch` için) |
| **redis (node)** | 4.6.x | Kuyruk tüketimi (`brPop`), durum yazımı |
| **Nodemailer** | 6.9.x | Erken uyarı e-postaları (SMTP) |

Bilinçli tercih: Worker'a **hiçbir ML bağımlılığı konmadı**. Ağır iş AI Engine'de; worker yeniden başlansa bile model bellek yükü oluşmaz.

### Altyapı ve Kalıcılık

| Teknoloji | Görevi |
|-----------|--------|
| **Docker + Docker Compose** | 4 servisi tek komutla ayağa kaldırma (`docker-compose.yml`) |
| **Redis (alpine imajı)** | Görev kuyruğu ve durum deposu |
| **SQLite** | Analiz kayıtları (ai-engine) ve abonelikler (frontend/Prisma); aynı `.db` dosyası `./data` mount'u ile paylaşılır |
| **Git** | Sürüm kontrolü; dallar: `main`, `feature/ML` |

---

## 5. Uçtan Uca Veri Akışı

Bir analiz isteğinin yaşam döngüsü:

```
1. Kullanıcı haritada bölge çizer ve "Analiz Et" der.

2. Tarayıcı → Next.js API route (POST /api/analyze)
   Route, isteği AI Engine'e vekalet eder.

3. AI Engine (POST /api/analyze):
   a. bbox/start_points doğrulaması (Pydantic + manuel kontrol)
   b. task_id = uuid4().hex üretir
   c. Redis'e yazar:
      HSET task:{id} status="pending" payload={lat,lon,...} created_at=...
      RPUSH taskQueue {id}
   d. Yanıt: {"task_id": "...", "message": "Görev kuyruğa eklendi"}

4. Tarayıcı ~3 saniyede bir GET /api/analyze?task_id=... ile durum yoklar.
   (Next.js route → AI Engine GET /api/status/{task_id} → Redis HGETALL)

5. Worker (BRPOP taskQueue):
   a. Görevi alır, status="processing" yazar
   b. POST /internal/analyze → AI Engine
      - GEE'den Sentinel-2 görüntüsü indirilir (t1, t2)
      - NDVI hesaplanır, değişim haritası üretilir
      - RGB karosu YOLOv8'e verilir (deforestation/pollution tespiti)
      - Sonuç SQLite regions_analysis tablosuna kaydedilir (region_id)
      - Önbellek PNG'leri yazılır (rgb/ndvi/diff)
   c. Sonuç JSON'u task:{id} hash'ine yazılır, status="completed"
   d. Risk yüksekse erken uyarı e-postası gönderilir (SMTP)

6. Polling "completed" görünce tarayıcı sonucu gösterir:
   - Ormansızlaşma/kirlilik risk seviyesi kartları
   - NDVI grafiği
   - Before/after uydu görüntüleri (/images endpoint'i üzerinden)
   - PDF dışa aktarma (jsPDF)

Hata durumunda status="failed" + error alanı yazılır; polling bunu da gösterir.
```

**Zamanlama notu:** `ANALYSIS_TIMEOUT_MS` (varsayılan 180000) worker'ın analiz çağrısına üst sınır koyar; aşılırsa görev `failed` olur.

---

## 6. Bileşen Detayları

### 6.1 Frontend (`frontend/`)

- **Ana sayfa (`src/app/page.js`):** Leaflet haritası; kullanıcı `leaflet-draw` ile bölge çizer, başlangıç/bitiş noktaları `{lat, lng}` formatında gönderilir.
- **Bölge sayfası (`src/app/region/page.js`):** Analiz sonucunun canlı takip edildiği ekran. Polling mantığını içerir; nokta payload'u `{lat, lon}` gönderir (ana sayfadan farklı anahtar!). Backend iki isimlendirmeyi de tolere eder (`_extract_lat_lon`).
- **API route'ları (`src/app/api/`):** Tarayıcı doğrudan AI Engine'e gitmez; CORS ve ortam bağımsızlığı için Next.js sunucu tarafı proxy kullanır.
- **Prisma şeması:** Periyodik abonelik tabloları; SQLite'a `better-sqlite3` adaptörüyle bağlanır.
- **Ortam değişkeni köprüsü:** `NEXT_PUBLIC_*` değişkenleri build zamanında tarayıcıya gömülür.

### 6.2 AI Engine (`ai-engine/`)

- **`main.py`:** Tüm FastAPI endpoint'leri. Lifespan hook'unda `init_db()` ile tablolar garanti edilir. CORS şu anda geniş (`allow_origins=["*"]`) — production için daraltılmalı (bkz. §12).
- **`services/analysis_service.py`:** Analizin kalbi. Sırasıyla: bölge adı çözümlemesi → uydu görüntüsü indirme (satellite_api) → NDVI → YOLO tespiti → değişim haritaları → risk skorlaması (`yok|dusuk|orta|yuksek`). Her aşama hataya dayanıklıdır; tek bir parça başarısız olsa da analiz tamamlanmaya çalışır (`demo_mode`, `model_loaded` bayraklarıyla).
- **`services/satellite_api.py`:** GEE kimlik doğrulaması, Sentinel-2 bulut maskesi, karo önbelleği (`data/cache/` altında lat/lon bazlı dosya adlandırma).
- **`services/yolo_service.py`:** `MODEL_PATH` veya fallback zinciriyle ağırlık yükler; model bulunamazsa `model_loaded=false` ile devam eder — **sistem asla çökmez**.
- **`utils/index.py`:** SQLite şema tanımı ve bağlantı havuzu. `regions_analysis` tablosu analiz sonuçlarını saklar.
- **GEE kimliği:** `geomorphosis-cb3ae273c071.json` servis hesabı dosyası repo klasöründe durur ama `.gitignore`'dadır (bkz. §8).

### 6.3 Worker (`worker/`)

- **`index.js`:** Sonsuz döngü: `brPop('taskQueue', 0)` → görevi al → `POST {AI_ENGINE_URL}/internal/analyze` → sonucu `task:{id}` hash'ine yaz → yüksek riskte e-posta. `lng`/`lon` anahtar farkını normalize eder.
- **`services/notifier.js`:** SMTP ayarlarıyla Nodemailer taşıyıcısı; `ALERT_EMAIL_TO` boşsa `SMTP_USER`'a gider.
- Bağımlılık minimalizmi bilinçlidir: sadece `redis` + `nodemailer`.

### 6.4 Data klasörü (`data/`)

- `geopulse_clean.db`: Canlı SQLite veritabanı.
- `geopulse_fresh.db": Temiz şablon kopya — sıfırdan başlamak için yeniden adlandırıp kullanılır.
- `ai-engine/data/cache/`: Uydu karoları, NDVI ve diff PNG'leri. Aynı analiz tekrar istendiğinde GEE çağrısı yapılmaz, önbellekten sunulur (maliyet + hız kazancı).

### 6.5 Redis

| Anahtar | Tip | İçerik |
|---------|-----|--------|
| `taskQueue` | list | Bekleyen `task_id` değerleri (FIFO via RPUSH/BRPOP) |
| `task:{id}` | hash | `status`, `payload`, `created_at`, `result` (JSON string), `error` |

Durum makinesi: `pending → processing → completed | failed`

---

## 7. API Referansı

### AI Engine (`http://localhost:8000`)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| POST | `/api/analyze` | Analizi kuyruğa alır, `task_id` döner |
| POST | `/analyze` | Eski yol; `/api/analyze`'a yönlendirilir (geriye dönük uyumluluk) |
| GET | `/api/status/{task_id}` | `pending`/`processing`/`completed`/`failed` durumu + sonuç |
| POST | `/internal/analyze` | Senkron analiz — **sadece worker kullanır**, dışarıya açılmamalı |
| GET | `/images?lat&lon&kind=rgb\|ndvi\|diff&year` | Önbellekteki karoyu/değişim haritasını PNG olarak sunar |
| GET | `/satellite/latest?lat&lon&buffer_meters` | En güncel uydu görüntüsü meta bilgisi |
| GET | `/docs` | Otomatik Swagger UI |

### Frontend route'ları (`http://localhost:3000`)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| POST | `/api/analyze` | Analiz başlatır (AI Engine proxy) |
| GET | `/api/analyze?task_id=` | Durum sorgular (proxy) |
| POST | `/api/subscribe` | Periyodik bildirim aboneliği |
| POST | `/api/notify` | Telegram bildirimi gönderir |
| POST | `/api/notify/email` | E-posta bildirimi gönderir |

### Analiz sonucu sözleşmesi (`result` alanının şeması)

```jsonc
{
  "status": "Analiz tamamlandı",
  "timestamp": "2026-08-08T12:00:00Z",
  "region_name": "36.8530, 28.2715",       // Nominatim'den çözülür ya da koordinat
  "ndvi_score": 0.61,
  "deforestation_risk": "orta",             // yok | dusuk | orta | yuksek
  "pollution_level": "dusuk",
  "demo_mode": false,                       // true ise kısmi veriyle çalışıldı
  "model_loaded": true,                     // false ise YOLO atlandı
  "region_id": 12,                          // SQLite kayıt id'si
  "ai_results": {
    "yolo_detections": [
      { "class": "deforestation", "confidence": 0.82, "bbox": [] }
    ],
    "environmental_metrics": {
      "ndvi_t1_mean": 0.42,
      "ndvi_t2_mean": 0.31,
      "ndvi_change": -0.11
    },
    "change_detection": {
      "deforestation": {},                  // hektar/yüzde bilgileri
      "lake_shrinkage": {}
    }
  },
  "downloaded": []                          // indirilen dosya yolları
}
```

Frontend bu şemadaki düz alanlara (`deforestation_risk`, `pollution_level`...) ve `ai_results` bloğuna güvenir — **alan adlarını değiştirirsen iki tarafı birlikte güncelle.**

---

## 8. Ortam Değişkenleri ve Konfigürasyon

İki örnek dosya vardır:

- Kök `.env.example` → `docker-compose.yml` tarafından okunur → `.env` olarak kopyalanır
- `frontend/.env.example` → Next.js tarafından okunur → `frontend/.env` olarak kopyalanır

### Bildirim ayarları

| Değişken | Açıklama |
|----------|----------|
| `SMTP_HOST` | E-posta sunucusu (örn. `smtp.gmail.com`) |
| `SMTP_PORT` | Genelde `587` (STARTTLS) |
| `SMTP_USER` / `SMTP_PASS` | Gmail ise **uygulama şifresi** (normal şifre çalışmaz) |
| `ALERT_EMAIL_TO` | Erken uyarı alıcısı; boşsa `SMTP_USER` kullanılır |
| `TELEGRAM_BOT_TOKEN` | BotFather'dan alınan bot token'ı |
| `TELEGRAM_CHAT_ID` | Alıcı sohbet id'si (pozitif: bireysel, negatif: grup, `-100...`: kanal) |
| `TELEGRAM_WEBHOOK_SECRET` | Webhook doğrulama sırrı |
| `NOTIFICATION_INTERNAL_SECRET` | Worker ↔ frontend dahili çağrı doğrulaması |

### Model ayarları

| Değişken | Açıklama |
|----------|----------|
| `MODEL_PATH` | YOLO ağırlık yolu. Boşsa sırayla aranır: `models/best.pt` → `models/deforestation_yolov8_v2.pt` → `models/deforestation_yolov8.pt` → `yolov8n.pt`. Hiçbiri yoksa sistem çökmez: `model_loaded:false`, risk yalnız NDVI'den gelir |
| `YOLO_CONF_THRESHOLD` | Nesne tespiti güven eşiği (varsayılan `0.25`; `.env.example` içinde `0.10`) |

### Servis adresleri

| Değişken | Docker değeri | Native değer |
|----------|---------------|--------------|
| `REDIS_HOST` / `REDIS_PORT` | `redis` / `6379` | `localhost` / `6379` |
| `AI_ENGINE_URL` (worker) | `http://ai-engine:8000` | `http://localhost:8000` |
| `NEXT_PUBLIC_AI_ENGINE_URL` | `http://ai-engine:8000` | `http://localhost:8000` |
| `DATABASE_URL` | `file:./data/geopulse.db` | aynı |
| `FRONTEND_URL` (worker) | `http://web-client:3000` | `http://localhost:3000` |

> **Önemli:** Hiçbir `REDIS_HOST` tanımlı değilse tüm bileşenler `localhost`'a düşer — yani **native geliştirme kutudan çıktığı gibi çalışır**. Docker compose ortam değişkenlerini kendisi enjekte eder.

Diğerleri:

| Değişken | Açıklama |
|----------|----------|
| `ANALYSIS_TIMEOUT_MS` | Uydu indirme + YOLO üst sınırı, ms (varsayılan `180000`) |
| `GOOGLE_EARTH_ENGINE_PROJECT` | GEE proje kimliği (`geomorphosis-cb3ae273c071`) |
| `GEOMORPHOSIS_DATA_DIR` | Veri klasörünü farklı yere taşımak için |

### Google Earth Engine kimliği

- Dosya: `ai-engine/geomorphosis-cb3ae273c071.json` (servis hesabı anahtarı)
- `.gitignore`'daki `ai-engine/*.json` kuralı nedeniyle **repo ile gelmez** — devralan ekibe güvenli kanaldan (parola yöneticisi vb.) aktarılmalıdır.
- Kaybolursa: Google Cloud Console → ilgili proje → Service Accounts → yeni anahtar üret.

---

## 9. Kurulum ve Çalıştırma

### Gereksinimler

- Node.js >= 18
- Python >= 3.11
- Docker >= 24.0 (opsiyonel; Redis için en azından gerekli ya da yerel Redis kurulumu)

### Yöntem 1 — Native geliştirme (önerilen günlük akış)

Üç terminal gerekir:

```bash
# 1) Redis (en kolay yol: tek konteyner)
docker run -d --name geomorphosis-redis -p 6379:6379 redis:alpine

# 2) AI Engine
cd ai-engine
python -m venv venv
source venv/Scripts/activate        # Windows Git Bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 3) Worker
cd worker
npm install
node index.js                       # env gerekmez: localhost varsayılanları

# 4) Frontend (ayrı terminal)
cd frontend
npm install
npm run dev                         # http://localhost:3000
```

### Yöntem 2 — Hızlı başlatma scriptleri

```powershell
.\dev-start.ps1            # venv/node_modules hazırsa direkt başlatır
.\dev-start.ps1 -Install   # venv oluşturur, python+node bağımlılıklarını kurar
.\dev-stop.ps1             # hepsini durdurur
```

(Linux/Mac için `dev-start.sh` / `dev-stop.sh` eşdeğerleri vardır.)

### Yöntem 3 — Tam Docker yığını

```bash
cp .env.example .env        # doldurun (SMTP, Telegram, GEE proje)
docker-compose up --build
```

Servisler: `geomorphosis-ai-engine` (:8000), `geomorphosis-frontend` (:3000), `geomorphosis-worker`, `geomorphosis-redis` (:6379). `./data` klasörü üç servise ortak mount edilir.

> **Karma mod uyarısı:** AI Engine native + worker Docker çalıştıracaksanız worker'a `AI_ENGINE_URL=http://host.docker.internal:8000` verin; konteyner içinden `localhost` host makineyi göstermez.

---

## 10. Test ve Kalite Güvencesi

| Bileşen | Komut | Not |
|---------|-------|-----|
| ai-engine | `cd ai-engine && python -m pytest -q tests/` | API + servis testleri (httpx gerektirir) |
| worker | `cd worker && npm install && node --test` | Kuyruk + notifier testleri |
| frontend | `cd frontend && npm run test` | Özel loader ile node:test |
| lint | `cd frontend && npm run lint` | ESLint |

Windows'ta `test-aiengine.bat`, `test-worker.bat`, `test-frontend.bat` hızlı yollar sağlar.

Testler ağ erişimi gerektiren GEE çağrılarını mock'lar; CI dostudur.

---

## 11. Model Yönetimi ve Yeniden Eğitim

### Aktif model

- Dosya: `ai-engine/models/best.pt`
- Sınıflar: `{0: 'deforestation', 1: 'pollution'}`
- Ağırlık dosyaları `.gitignore`'da olduğundan repo ile gelmez; güvenli kanaldan paylaşılmalı ya da §11'deki pipeline ile yeniden eğitilmelidir.

### Ağırlık arama sırası (`MODEL_PATH` boşsa)

1. `ai-engine/models/best.pt`
2. `ai-engine/models/deforestation_yolov8_v2.pt`
3. `ai-engine/models/deforestation_yolov8.pt`
4. `ai-engine/yolov8n.pt`

Hiçbiri bulunamazsa: nesne tespiti **atlanır**, sonuç `model_loaded: false` ile işaretlenir ve riskler yalnızca NDVI/ortamsal metriklere dayanır.

### Eğitim pipeline'ı

```
utils/data_collector.py      → GEE'den örnek görüntülerin toplanması
utils/auto_labeler.py        → otomatik etiketleme yardımcıları
utils/prepare_yolo_dataset.py→ veriyi YOLO formatına dönüştürme
train.py                     → eğitimi başlatır (çıktılar runs/ altına yazılır)
```

Yeni ağırlık eğitildikten sonra `MODEL_PATH` ile işaret edin veya `best.pt` yerine koyun.

---

## 12. Bilinen Sorunlar ve Devir Notları

Devri alan ekibin bilmesi gereken somut gözlemler:

### Model kalitesi (yüksek öncelik)

- `best.pt` mevcut haliyle test bölgelerinin çoğunda **çok az ya da hiç tespit üretmiyor**; sentetik ormansızlaşma senaryolarında bile düşük güvenle çalışıyor. Muhtemelen eğitim verisi çeşitliliği yetersiz.
- Sistem tasarımdan dolayı çökmüyor (`model_loaded` bayrağı + ortamsal metrik fallback), ancak "yapay zeka destekli" iddiası için **yeniden eğitim şart**.
- Depoda geçmişten kalan bazı `.pt` dosyalarının **0 bayt placeholder** olduğunu unutmayın — gerçek ağırlık yalnızca `best.pt`.

### Güvenlik (production öncesi zorunlu)

- `main.py` CORS'u `allow_origins=["*"]` olarak açıyor → production'da frontend domain'iyle sınırlandırın.
- `/internal/analyze` kimlik doğrulamasız; ağ seviyesinde dışarıya kapalı tutulmalı (Docker ağı bunu sağlar; native modda dikkat edin).
- Gizli anahtarlar (GEE JSON, SMTP şifresi, bot token'ı) repoya girmez — `.gitignore` kuralları yerinde.

### Windows'a özgü notlar

- Çalışan bir uvicorn process'i log dosyalarını (`ai-engine/data/*.log`) kilitler; git bu dosyaları silmeye çalışınca "unlink failed" hatası verir. Bu dosyalar yakın zamanda takipten çıkarılıp `.gitignore`'a eklendi — **yeniden commit etmeyin.**
- Git Bash'te `taskkill //PID ... //F` gibi slash argümanları path'e dönüşür; PowerShell `Stop-Process -Id <pid> -Force` daha güvenilirdir.
- venv aktivasyon yolu Windows'ta `venv/Scripts/activate`, Linux/Mac'te `venv/bin/activate`'tir.

### Davranışsal incelikler

- Frontend iki farklı payload anahtarı gönderir: ana sayfa `{lat, lng}`, bölge sayfası `{lat, lon}`. AI Engine (`_extract_lat_lon`) ve worker ikisini de tolere eder — yeni endpoint eklerken bu toleransı koruyun.
- `regions_analysis` tablosuna yazma başarısız olsa bile analiz sonucu kullanıcıya döner (kalıcılık "nice-to-have" davranır).
- Redis erişilemezse `/api/analyze` 503 döner; frontend bunu kullanıcıya çevirir. Redis'i ilk ayağa kaldıran bileşen olun.

### Dağıtım notları

- `NEXT_PUBLIC_*` değişkenleri build zamanında gömülür; değiştirirseniz frontend'i yeniden build edin.
- SQLite production için tek yazıcı varsayar; yüksek eşzamanlılık planlanıorsa PostgreSQL'e geçiş değerlendirilmelidir.

---

## 13. Devir Kontrol Listesi ve Önerilen Yol Haritası

### Devir teslimde elden geçirilmesi gerekenler

- [ ] `.env` dosyalarının (kök + frontend) gerçek değerlerle doldurulduğu
- [ ] GEE servis hesabı JSON'unun `ai-engine/` altına yerleştirildiği
- [ ] `best.pt` ağırlığının `ai-engine/models/` altında olduğu
- [ ] Redis'in erişilebilir olduğu (`docker ps` veya yerel servis)
- [ ] Üç bileşenin sırayla ayağa kalktığı: Redis → AI Engine → Worker → Frontend
- [ ] Haritada küçük bir bölge çizilip uçtan uca analiz alındığı
- [ ] Testlerin yeşil olduğu (§10'daki komutlar)
- [ ] Telegram bot token + chat id'nin doğrulanmış olduğu

### Önerilen yol haritası (öncelik sırasıyla)

1. **Model iyileştirme:** `best.pt` için veri setini büyütüp yeniden eğitim; tespit kalitesinin ölçülebilir hale getirilmesi (precision/recall raporu).
2. **Kimlik doğrulama:** Kullanıcı girişi ve `/internal/*` uçlarının korunması.
3. **WebSocket/SSE:** 3 saniyelik polling yerine gerçek zamanlı durum yayını.
4. **PostgreSQL geçişi:** Çok kullanıcılı senaryo için.
5. **CI/CD:** GitHub Actions ile test + imaj build otomasyonu (deploy artifact işleri dal geçmişinde mevcuttur).
6. **CORS sıkılaştırma ve rate limiting.**

---

*Dokümanın eskiymesine karşı: Şüphede kaldığınızda kaynak kodu ve README.md'yi esas alın; bu dosya onların bir yorumudur, yerine geçmez.*
