const { createClient } = require('redis');
const notifier = require('./services/notifier');

// Docker-compose üzerinden gelen Redis adresini alıyoruz
const redisHost = process.env.REDIS_HOST || 'redis';
const redisPort = process.env.REDIS_PORT || 6379;

const redisClient = createClient({
    url: `redis://${redisHost}:${redisPort}`
});

redisClient.on('error', (err) => console.log('Redis İstemci Hatası:', err));

async function processTask(taskId) {
    console.log(`[MUTFAK] Görev işlenmeye başlandı: ${taskId}`);
    
    // 1. Görevin durumunu 'processing' (işleniyor) olarak güncelle
    await redisClient.hSet(`task:${taskId}`, 'status', 'processing');

    // 2. Yapay zeka / Analiz simülasyonu (Burada asıl analiz süreci dönüyor)
    // Gerçekte burada Python ai-engine ile iletişim kurulabilir veya veri işlenebilir.
    await new Promise(resolve => setTimeout(resolve, 5000)); // 5 saniye sürdüğünü varsayıyoruz

    // 3. Sonuçları hazırla (Nokta çakışması olmaması için formatı frontend'e uygun, temiz liste halinde vereceğiz)
    const resultData = JSON.stringify({
        message: "Analiz başarıyla tamamlandı.",
        // Frontend'in beklediği temiz data formatı. 
        // İçi boş bırakıldı, backend ve frontend'i güncellerken burayı onların istediği point yapısına göre doldururuz.
        processedPoints: [] 
    });

    // 4. Görevi tamamlandı olarak işaretle ve Redis'e sonucu yaz
    await redisClient.hSet(`task:${taskId}`, {
        status: 'completed',
        result: resultData
    });

    console.log(`[MUTFAK] Görev tamamlandı ve hazır: ${taskId}`);

    // (Opsiyonel) Kullanıcıya bildirim gönder
    // await sendNotification('kullanici@example.com', 'Geomorphosis Analizi', `${taskId} numaralı harita analiziniz tamamlandı.`);
}

async function startWorker() {
    await redisClient.connect();
    console.log('Geomorphosis Worker (Mutfak) Redis\'e bağlandı. Yeni analiz görevleri bekleniyor...');

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
startWorker();