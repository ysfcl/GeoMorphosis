const { createClient } = require('redis');

// Redis adresi: native geliştirmede localhost, Docker compose'da 'redis' servis adı.
const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = process.env.REDIS_PORT || 6379;

// Ai-engine adresi: native'de localhost, Docker compose'da 'ai-engine' servis adı.
const aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:8000';

const redisClient = createClient({
    url: `redis://${redisHost}:${redisPort}`
});

redisClient.on('error', (err) => console.log('Redis İstemci Hatası:', err));

async function processTask(taskId) {
    console.log(`[MUTFAK] Görev işlenmeye başlandı: ${taskId}`);

    // 1. Görevin durumunu 'processing' (işleniyor) olarak güncelle
    await redisClient.hSet(`task:${taskId}`, 'status', 'processing');

    try {
        // 2. Kuyruğa konulan görev verisini (start_points vb.) Redis'ten oku
        const rawData = await redisClient.hGet(`task:${taskId}`, 'data');
        if (!rawData) throw new Error('Görev verisi Redis\'te bulunamadı');

        const taskData = JSON.parse(rawData);
        const startPoint = Array.isArray(taskData.start_points) ? taskData.start_points[0] : null;
        if (!startPoint || startPoint.lat == null) {
            throw new Error('Görev verisinde geçerli start_point bulunamadı');
        }

        const lat = startPoint.lat;
        const lon = startPoint.lng ?? startPoint.lon; // frontend hem 'lng' hem 'lon' anahtari kullaniyor
        const bufferMeters = taskData.buffer_meters || 1000;

        console.log(`[MUTFAK] Analiz başlatılıyor: (${lat}, ${lon}) buffer=${bufferMeters}m -> ${aiEngineUrl}/api/process`);

        // 3. Gerçek analizi ai-engine'den (FastAPI) al
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 180000); // GEE sorguları uzun sürebilir

        const response = await fetch(`${aiEngineUrl}/api/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lat,
                lon,
                buffer_meters: bufferMeters,
            }),
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!response.ok) {
            throw new Error(`ai-engine /api/process HTTP ${response.status}`);
        }

        const analysisResult = await response.json();

        // 4. Sonucu Redis'e yaz (frontend'in beklediği format)
        await redisClient.hSet(`task:${taskId}`, {
            status: 'completed',
            result: JSON.stringify(analysisResult),
        });

        console.log(`[MUTFAK] Görev tamamlandı: ${taskId} (NDVI=${analysisResult.ndvi_score}, Yangın=${analysisResult.fire_risk}, Kirlilik=${analysisResult.pollution_level})`);
    } catch (error) {
        console.error(`[MUTFAK] Görev başarısız: ${taskId}:`, error.message);

        await redisClient.hSet(`task:${taskId}`, {
            status: 'failed',
            result: JSON.stringify({ error: error.message }),
        });
    }
}

async function startWorker() {
    await redisClient.connect();
    console.log('Geomorphosis Worker (Mutfak) Redis\'e bağlandı. Yeni analiz görevleri bekleniyor...');

    while (true) {
        try {
            const task = await redisClient.brPop('taskQueue', 0);

            if (task && task.element) {
                await processTask(task.element);
            }
        } catch (error) {
            console.error('[MUTFAK] Görev işleme sırasında kritik hata:', error);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

startWorker();
