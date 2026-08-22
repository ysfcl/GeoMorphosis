# GeoMorphosis - Project Core Overview

## 🌍 Project Purpose

**GeoMorphosis** is an AI-powered environmental monitoring and early warning platform that leverages satellite imagery to detect and analyze environmental changes across geographic regions. The platform provides users with real-time alerts, comprehensive analytics, and PDF reports for environmental hazards including wildfires, pollution, deforestation, and other ecological changes.

### Key Value Propositions
- **Geospatial AI Analysis**: Utilizes satellite imagery processed with YOLOv8 AI models for accurate environmental monitoring
- **Real-time Early Warning System**: Automated notifications for detected environmental anomalies
- **Interactive Geographic Interface**: Map-based region selection and visualization using Leaflet and React-Leaflet
- **Automated Reporting**: PDF generation for detailed environmental analysis reports
- **Multi-source Data Integration**: Combines data from Copernicus, NASA FIRMS, Google Earth Engine, and Sentinel satellites

---

## 🏗️ Project Architecture

### Microservices Structure

```
GeoMorphosis/
├── frontend/          # Web UI (Next.js + React)
├── ai-engine/         # Image Processing & Analysis (Python FastAPI)
├── worker/            # Background Job Processor (Node.js)
└── data/              # SQLite Database & Cache Storage
```

### Technology Stack

| Component | Technologies |
|-----------|--------------|
| **Frontend** | Next.js 14, React 18, TailwindCSS 3, Leaflet 1.9, Bootstrap 5, Chart.js/Recharts |
| **AI Engine** | Python, FastAPI, YOLOv8, OpenCV, Rasterio, Google Earth Engine API |
| **Worker Service** | Node.js, node-cron, Nodemailer, Redis |
| **Database** | SQLite (local), Redis (caching & task queue) |
| **Container** | Docker, Docker Compose |

---

## 📦 Service Components

### 1. **Frontend Service** (`/frontend`)
**Purpose**: Web interface for user interaction and visualization

**Key Features**:
- Interactive map-based region selection (Leaflet with draw tools)
- Real-time status tracking of analysis tasks
- Dashboard with analytics charts (Chart.js, Recharts)
- PDF report generation (jsPDF)
- Email notification subscriptions
- Bootstrap-based responsive UI

**Tech Stack**:
- Next.js 14 (Framework)
- React 18 (UI Library)
- Leaflet & leaflet-draw (Maps)
- TailwindCSS (Styling)
- Axios (HTTP client)
- Prisma Client (Database ORM)

**Port**: `http://localhost:3000`

---

### 2. **AI Engine** (`/ai-engine`)
**Purpose**: Core image processing and environmental analysis

**Key Features**:
- Downloads satellite imagery from multiple sources
- Processes images using YOLOv8 object detection
- Analyzes environmental changes (fire, pollution, deforestation)
- Stores analysis results and metadata
- Provides REST API endpoints for analysis jobs

**Tech Stack**:
- FastAPI (REST Framework)
- YOLOv8 (Object Detection)
- OpenCV (Image Processing)
- Rasterio (GeoTIFF/Satellite data)
- Google Earth Engine API
- Redis (Task queue communication)
- SQLite (Results storage)

**Port**: `http://localhost:8000`

**Key Endpoints**:
- `POST /api/analyze` - Submit region for analysis
- `GET /api/status/{task_id}` - Check analysis progress
- `GET /satellite/latest` - Fetch latest satellite imagery

**Processing Flow**:
1. Receive region coordinates and analysis parameters
2. Download satellite imagery for specified time period
3. Process imagery with YOLOv8 AI models
4. Detect environmental anomalies
5. Store results and queue for notification

---

### 3. **Worker Service** (`/worker`)
**Purpose**: Background job processor for notifications and scheduled tasks

**Key Features**:
- Monitors Redis task queue for pending analysis jobs
- Processes completed analyses
- Sends email notifications to subscribers
- Runs on defined schedules (node-cron)
- Manages notification subscriptions and delivery

**Tech Stack**:
- Node.js
- Redis Client (Queue communication)
- Nodemailer (Email service)
- node-cron (Scheduling)

**Workflow**:
1. Connects to Redis and monitors `taskQueue`
2. Retrieves pending tasks when available
3. Updates task status to "processing"
4. Simulates/runs analysis (currently placeholder)
5. Marks task as "completed" with results
6. Sends notifications via email to subscribers

---

### 4. **Data Layer** (`/data`)
**Purpose**: Local persistence and caching

**Components**:
- `geopulse.db` - Primary SQLite database
- `geopulse_clean.db` - Backup/cleaned database
- `geopulse_fresh.db` - Fresh template database

**Data Stored**:
- Analysis results and metadata
- User subscriptions and preferences
- Satellite imagery metadata
- Detected environmental events
- Report history

---

## 🔄 Application Flow

### Typical User Workflow

```
1. User opens Frontend (http://localhost:3000)
   ↓
2. User selects region on map (using Leaflet draw tools)
   ↓
3. Frontend submits analysis request to AI Engine
   └─→ POST /api/analyze
   ↓
4. AI Engine generates task_id and queues job to Redis
   ├─→ Stores task in Redis: task:{task_id}
   └─→ Pushes to taskQueue
   ↓
5. Frontend polls status endpoint
   └─→ GET /api/status/{task_id}
   ↓
6. Worker Service picks up task from queue
   ├─→ Downloads satellite imagery
   ├─→ Processes with YOLOv8 models
   └─→ Analyzes environmental changes
   ↓
7. Worker stores results in Redis
   └─→ Updates task status to "completed"
   ↓
8. Frontend receives analysis results
   ├─→ Displays on map
   ├─→ Shows analytics charts
   └─→ Generates PDF report
   ↓
9. Worker sends email notification to subscribers
   └─→ Nodemailer → SMTP server
```

---

## 🔑 Environment Variables

Required configuration (`.env` file):

```env
# Copernicus API (Satellite imagery)
COPERNICUS_CLIENT_ID=<your-client-id>
COPERNICUS_CLIENT_SECRET=<your-client-secret>

# NASA FIRMS API (Fire data)
NASA_FIRMS_API_KEY=<your-api-key>

# Email/SMTP Configuration
SMTP_USER=<sender-email@gmail.com>
SMTP_PASS=<app-specific-password>

# Redis Configuration (Docker)
REDIS_HOST=redis
REDIS_PORT=6379

# Google Earth Engine (Optional)
EE_PRIVATE_KEY_ID=<key-id>
EE_PRIVATE_KEY=<private-key>
```

---

## 🚀 Deployment & Running

### Local Development

```bash
# Terminal 1: Frontend
cd frontend
npm install
npm run dev  # http://localhost:3000

# Terminal 2: AI Engine
cd ai-engine
python -m venv venv
source venv/Scripts/activate  # Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Terminal 3: Worker
cd worker
npm install
npm start

# Terminal 4: Optional - Redis
redis-server
```

### Docker Deployment

```bash
# Copy environment template
cp .env.example .env

# Edit .env with API keys and credentials

# Start all services
docker-compose up --build

# Services available at:
# Frontend: http://localhost:3000
# AI Engine: http://localhost:8000
# Redis: localhost:6379
```

---

## 📊 Data Processing Pipeline

### Satellite Data Sources
- **Copernicus Sentinel**: High-resolution satellite imagery
- **NASA FIRMS**: Fire detection and tracking
- **Google Earth Engine**: Multi-temporal environmental data
- **Rasterio Processing**: GeoTIFF and satellite data format handling

### Analysis Models
- **YOLOv8**: Object detection for environmental features
- **OpenCV**: Image enhancement and preprocessing
- **Custom AI Models**: Environment-specific anomaly detection

### Output Formats
- **Interactive Maps**: Leaflet-based visualization
- **Analytics Charts**: Chart.js and Recharts visualizations
- **PDF Reports**: jsPDF-generated detailed analysis documents
- **Email Notifications**: SMTP-based alert delivery

---

## 🔌 API Communication

### Frontend ↔ AI Engine
- **Protocol**: HTTP REST with JSON
- **Queue**: Redis (task persistence)
- **Pattern**: Fire-and-forget with polling for results

### AI Engine ↔ Worker
- **Protocol**: Redis Pub/Sub and Lists
- **Queue Name**: `taskQueue`
- **Task Format**: JSON-serialized analysis parameters

### Worker → Email Service
- **Protocol**: SMTP (Nodemailer)
- **Trigger**: Task completion
- **Recipients**: Subscribed user emails

---

## 🧪 Testing

### Frontend Tests
```bash
cd frontend
npm run test
```

### AI Engine Tests
```bash
cd ai-engine
python -m pytest -q tests/test_satellite_service.py
```

### Worker Tests
```bash
cd worker
node --test
```

---

## 📋 Project Status & Components

| Component | Status | Purpose |
|-----------|--------|---------|
| Frontend UI | ✅ Active | User interface and visualization |
| AI Engine API | ✅ Active | Image processing and analysis |
| Worker Service | ✅ Active | Background job processing |
| Database | ✅ Active | Data persistence |
| Docker Setup | ✅ Ready | Multi-container deployment |
| Testing Framework | ✅ Configured | Unit and integration tests |

---

## 🎯 Key Features

1. **Real-time Environmental Monitoring**
   - Continuous satellite imagery analysis
   - Automated anomaly detection
   - Multi-temporal change tracking

2. **Early Warning System**
   - Fire detection and alerts
   - Pollution level monitoring
   - Deforestation tracking

3. **Interactive Dashboard**
   - Map-based region selection
   - Real-time analysis status
   - Historical data visualization
   - Chart and graph analytics

4. **Reporting & Export**
   - PDF report generation
   - Detailed analysis export
   - Trend analysis over time

5. **Notification System**
   - Email subscriptions
   - Real-time alerts
   - Customizable notification preferences

---

## 🔐 Security Considerations

- API keys stored in `.env` (never committed)
- Redis authentication in production
- CORS configured for frontend origin
- Input validation on all endpoints
- Database encryption recommended for production

---

## 🚧 Future Enhancements

- Advanced ML models for multi-class environmental detection
- Real-time WebSocket updates instead of polling
- Mobile app support
- User authentication and authorization
- Multi-language support
- Advanced filtering and export options
- Integration with climate databases

---

## 📝 License

MIT License

---

## 👥 Architecture Summary

**GeoMorphosis** follows a **microservices architecture** with clear separation of concerns:

- **Frontend**: User-facing web application
- **AI Engine**: Specialized satellite image processing
- **Worker**: Asynchronous job processing and notifications
- **Data**: Centralized persistence layer

This design enables:
✅ Independent scaling of components
✅ Technology diversity (Node.js, Python, databases)
✅ Parallel development by separate teams
✅ Easy testing and debugging
✅ Container-based deployment
✅ Resilient error handling with Redis queue

---

**Last Updated**: August 2026
**Project Language**: Turkish (Documentation) / Multilingual (Code)
**Version**: 1.0.0
