const { createClient } = require('redis');
const notifier = require('./services/notifier');

// Docker-compose üzerinden gelen Redis adresini alıyoruz
const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = process.env.REDIS_PORT || 6379;

// Yapay zeka motorunun (Vezne/FastAPI) adresi
const aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:8000';

// Uydu görüntüsü indirme + YOLO tahmini uzun sürebiliyor
const ANALYSIS_TIMEOUT_MS = Number(process.env.ANALYSIS_TIMEOUT_MS) || 180000;

const ALERT_TO = process.env.ALERT_EMAIL_TO || process.env.SMTP_USER;
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const notificationInternalSecret = process.env.NOTIFICATION_INTERNAL_SECRET;

const redisClient = createClient({
    url: `redis://${redisHost}:${redisPort}`
});

redisClient.on('error', (err) => console.log('Redis İstemci Hatası:', err));

// Kuyruğa yazılan payload'dan koordinatı çıkarır.
// FastAPI artık çözülmüş lat/lon yazıyor; eski görevler için start_points'e düşülür.
function extractCoordinates(payload) {
    if (typeof payload.lat === 'number' && typeof payload.lon === 'number') {
        return { lat: payload.lat, lon: payload.lon };
    }

    const first = (payload.start_points || [])[0];
    if (!first) return null;

    const lat = first.lat ?? first.latitude;
    const lon = first.lon ?? first.lng ?? first.longitude;

    if (lat === undefined || lat === null || lon === undefined || lon === null) {
        return null;
    }

    return { lat: Number(lat), lon: Number(lon) };
}

// Erken uyarı eşiği: yüksek yangın riski veya kritik bitki örtüsü kaybı
function shouldAlert(result) {
    if (result?.fire_risk === 'yuksek') return true;

    const deforestation = result?.ai_results?.change_detection?.deforestation;
    return deforestation?.severity === 'CRITICAL';
}

function buildAlertText(taskId, result) {
    const coords = result?.coordinates || {};
    const deforestation = result?.ai_results?.change_detection?.deforestation || {};

    return [
        `Fiş No: ${taskId}`,
        `Bölge: ${result?.region_name ?? 'Bilinmiyor'}`,
        `Koordinat: ${coords.lat}, ${coords.lon}`,
        '',
        `Yangın riski: ${result?.fire_risk}`,
        `Kirlilik seviyesi: ${result?.pollution_level}`,
        `NDVI skoru: ${result?.ndvi_score}`,
        `Bitki örtüsü kaybı: %${deforestation.loss_percentage ?? 0} (${deforestation.severity ?? 'LOW'})`,
        '',
        'Bu uyarı GeoMorphosis AI Engine tarafından otomatik üretilmiştir.'
    ].join('\n');
}

async function sendAnalysisEmailToSubscriber(userId, result) {
    if (!userId) return false;

    const report = {
        lat: result?.coordinates?.lat,
        lng: result?.coordinates?.lon,
        riskLevel: result?.fire_risk || 'normal',
        summary: result?.demo_mode
            ? 'Uydu verisi alınamadığı için demo değerleri gösterildi.'
            : 'Bölge analizi tamamlandı, detaylar panelde görüntülenebilir.',
    };

    try {
        const response = await fetch(`${frontendUrl}/api/notify/email/subscriber`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(notificationInternalSecret
                    ? { 'x-notification-internal-secret': notificationInternalSecret }
                    : {}),
            },
            body: JSON.stringify({ userId, report }),
        });

        if (!response.ok) {
            console.error(`[MUTFAK] Abone e-postası gönderilemedi: HTTP ${response.status}`);
            return false;
        }

        const payload = await response.json();
        return payload.success === true;
    } catch (error) {
        console.error('[MUTFAK] Abone e-postası servisine ulaşılamadı:', error);
        return false;
    }
}

async function runAnalysis(payload, coordinates) {
    const response = await fetch(`${aiEngineUrl}/internal/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            lat: coordinates.lat,
            lon: coordinates.lon,
            buffer_meters: payload.buffer_meters || 1000,
            years: payload.years && payload.years.length ? payload.years : null,
            region_name: payload.region_name || null
        }),
        signal: AbortSignal.timeout(ANALYSIS_TIMEOUT_MS)
    });

    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`AI Engine ${response.status}: ${detail}`);
    }

    return response.json();
}

async function processTask(taskId) {
    console.log(`[MUTFAK] Görev işlenmeye başlandı: ${taskId}`);

    // 1. Görevin durumunu 'processing' (işleniyor) olarak güncelle
    await redisClient.hSet(`task:${taskId}`, 'status', 'processing');

    try {
        // 2. Vezne'nin kuyruğa yazdığı payload'ı oku
        const rawPayload = await redisClient.hGet(`task:${taskId}`, 'payload');
        const payload = rawPayload ? JSON.parse(rawPayload) : {};

        const coordinates = extractCoordinates(payload);
        if (!coordinates) {
            throw new Error('Görev payload\'ında geçerli koordinat bulunamadı');
        }

        // 3. Asıl analiz: modeli Python tarafında çalıştır
        console.log(`[MUTFAK] AI Engine çağrılıyor: ${coordinates.lat}, ${coordinates.lon}`);
        const result = await runAnalysis(payload, coordinates);

        // 4. Görevi tamamlandı olarak işaretle ve sonucu Redis'e yaz
        await redisClient.hSet(`task:${taskId}`, {
            status: 'completed',
            result: JSON.stringify(result)
        });

        console.log(
            `[MUTFAK] Görev tamamlandı: ${taskId} | ` +
            `yangın=${result.fire_risk} kirlilik=${result.pollution_level} ndvi=${result.ndvi_score}` +
            `${result.demo_mode ? ' (demo modu)' : ''}`
        );

        await sendAnalysisEmailToSubscriber(payload.user_id, result);

        // 5. Erken uyarı bildirimi
        if (shouldAlert(result)) {
            await notifier.sendAlert(
                ALERT_TO,
                `GeoMorphosis Erken Uyarı - ${result.region_name}`,
                buildAlertText(taskId, result)
            );
        }
    } catch (error) {
        console.error(`[MUTFAK] Görev başarısız: ${taskId}`, error);

        // Frontend polling'i 'failed' durumunu zaten işliyor
        await redisClient.hSet(`task:${taskId}`, {
            status: 'failed',
            error: error.message || 'Bilinmeyen hata'
        });
    }
}

async function startWorker() {
    await redisClient.connect();
    console.log('Geomorphosis Worker (Mutfak) Redis\'e bağlandı. Yeni analiz görevleri bekleniyor...');
    console.log(`AI Engine adresi: ${aiEngineUrl}`);

    // Kuyruğu dinleyen sonsuz döngü
    while (true) {
        try {
            // 'taskQueue' kuyruğundan görev bekle (BRPOP: Görev gelene kadar bloklar/bekler)
            const task = await redisClient.brPop('taskQueue', 0);

            if (task && task.element) {
                await processTask(task.element);
            }
        } catch (error) {
            console.error('[MUTFAK] Görev işleme sırasında kritik hata:', error);
            // Hata olursa sonsuz döngünün kilitlenmemesi için kısa bir mola
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

// Worker'ı başlat
if (require.main === module) {
    startWorker();
}

module.exports = { processTask, extractCoordinates, shouldAlert, sendAnalysisEmailToSubscriber, startWorker };
