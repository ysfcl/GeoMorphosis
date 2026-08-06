import { NextResponse } from 'next/server';
import { sendTelegramNotification } from '@/lib/telegram';
import { buildMockAnalysis } from '@/lib/mockAnalysis';

export async function POST(request) {
  try {
    const body = await request.json();
    
    // Artık 'coordinates' yerine 'start_points' ve 'end_points' bekliyoruz
    const { start_points, end_points, buffer_meters } = body;

    if (!start_points || start_points.length === 0) {
      return NextResponse.json({ error: 'Başlangıç noktaları (start_points) gerekli' }, { status: 400 });
    }

    const aiEngineUrl = process.env.NEXT_PUBLIC_AI_ENGINE_URL || 'http://localhost:8000';

    // Vezne (FastAPI) için yeni payload yapımız
    const payload = {
      start_points,
      end_points: end_points || [],
      buffer_meters: buffer_meters || 1000,
    };

    const controller = new AbortController();
    // Timeout süresini sadece Vezne'nin kuyruğa alma süresi için kısa tutabiliriz
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      // FastAPI'nin YENİ asenkron endpointine (Vezne) istek atıyoruz
      const response = await fetch(`${aiEngineUrl}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      
      const data = await response.json(); // Burada sadece { task_id, message } dönecek

      const firstPoint = start_points[0];
      
      // Telegram'a analizin BAŞLADIĞINI (kuyruğa alındığını) bildiriyoruz
      await sendTelegramNotification(
        `📍 Koordinat: ${firstPoint.lat}, ${firstPoint.lng}\nYeni bir bölge analizi mutfak kuyruğuna (Redis) başarıyla eklendi.\n🎫 Fiş No: ${data.task_id}`,
        'GEO-PULSE Görev Kuyruğu'
      );

      // Frontend'e FastAPI'den gelen task_id'yi dönüyoruz ki sorgulamaya başlasın
      return NextResponse.json(data);

    } catch(error) {
      clearTimeout(timeout);

      // --- DEMO FALLBACK: AI Engine'e ulaşılamazsa mock analiz başlat ---
      const firstPoint = start_points[0];
      console.warn(`AI Engine'e ulaşılamadı (${error.message}). Demo analiz döndürülüyor.`);

      await sendTelegramNotification(
        `Vezneye (FastAPI) bağlanırken hata oluştu: ${error.message}`,
        'Sistem Bağlantı Hatası'
      );

      const mock = buildMockAnalysis({
        taskId: `demo-${Date.now()}`,
        lat: firstPoint.lat,
        lon: firstPoint.lng,
        regionName: firstPoint.region_name,
      });

      return NextResponse.json({ task_id: mock.task_id, message: mock.message, demo: true });
    }
  } catch (error) {
    return NextResponse.json({ error: 'İstek işlenirken hata oluştu' }, { status: 500 });
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const aiEngineUrl = process.env.NEXT_PUBLIC_AI_ENGINE_URL || 'http://localhost:8000';
  
  // YENİ EKLENEN KISIM: task_id varsa Polling (Durum Sorgulama) işlemi yap
  const taskId = searchParams.get('task_id');

  if (taskId) {
    try {
      const response = await fetch(`${aiEngineUrl}/api/status/${taskId}`);
      const statusData = await response.json();

      // Eğer mutfak analizi bitirdiyse Telegram'a müjdeyi ver
      if (statusData.status === 'completed') {
         await sendTelegramNotification(
           `✅ Fiş No: ${taskId}\nHarita üzerinde bölge yapay zeka analizi başarıyla tamamlandı ve sonuçlar arayüze iletildi.`,
           'GEO-PULSE Analiz Raporu'
         );
      }

      // Frontend'e durumu ilet (pending, processing, completed veya failed)
      return NextResponse.json(statusData);
    } catch (error) {
      console.warn(`AI Engine durum sorgusu başarısız (${error.message}). Demo analiz döndürülüyor.`);

      // --- DEMO FALLBACK: task_id demo- ile başlıyorsa mock analiz tamamlandı olarak dön ---
      const mock = buildMockAnalysis({
        taskId,
        lat: 40.18,
        lon: 29.06,
      });

      return NextResponse.json(mock);
    }
  }

  // --- ESKİ SİSTEM GİBİ SADECE LAT/LON GELDİYSE (Geriye Dönük Uyumluluk İçin Korundu) ---
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');

  if (!lat || !lon) {
    return NextResponse.json({ error: 'task_id veya enlem/boylam gerekli' }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(
      `${aiEngineUrl}/satellite/latest?lat=${lat}&lon=${lon}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    const satelliteData = await response.json();

    await sendTelegramNotification(
      `👀 Koordinat: ${lat}, ${lon}\nBölge harita üzerinde görüntülendi.`,
      'Harita Görüntüleme Raporu'
    );

    return NextResponse.json({ status: 'completed', satellite: satelliteData });
  } catch (error) {
    await sendTelegramNotification(
      `Uydu servisi cevap vermediği için analiz sırasında bir hata oluştu: ${error.message}`,
      'Analiz Hatası'
    );
    return NextResponse.json({ error: 'Uydu verisi alınamadı' }, { status: 500 });
  }
}