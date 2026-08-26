import { NextResponse } from 'next/server';
import { sendSystemTelegramNotification } from '@/lib/telegram';
import Redis from 'ioredis';

// Redis bağlantısını başlatıyoruz (Docker veya lokal ortam uyumlu)
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export async function POST(request) {
  try {
    // --- GÜVENLİK DUVARI: RATE LIMIT (HIZ SINIRLAYICI) ---
    const ip = request.headers.get('x-forwarded-for') || 'bilinmeyen-ip';
    const rateLimitKey = `rate_limit:${ip}`;
    
    // IP'nin bu dakikadaki istek sayısını 1 artır
    // IP'nin bu dakikadaki istek sayısını 1 artır
    const currentRequests = await redis.incr(rateLimitKey);
    
    if (currentRequests === 1) {
      await redis.expire(rateLimitKey, 600); // Sayaç ömrü: 60 saniye
    }
    
    if (currentRequests > 5) {
      // REDIS'TEN KALAN SÜREYİ (SANİYE CİNSİNDEN) ÖĞRENİYORUZ
      const timeLeft = await redis.ttl(rateLimitKey);
      
      // MESAJI DİNAMİK HALE GETİRİYORUZ
      return NextResponse.json(
        { error: `Sistem güvenliği: Çok fazla analiz isteği attınız. Lütfen ${timeLeft} saniye sonra tekrar deneyin.` },
        { status: 429 }
      );
    }
    // ----------------------------------------------------

    const body = await request.json();

    // DÜZELTME: Gelen body'den bbox verisini de çıkarıyoruz
    const { start_points, end_points, buffer_meters, region_name, user_id: userId, bbox } = body;

    if (!start_points || start_points.length === 0) {
      return NextResponse.json({ error: 'Başlangıç noktaları (start_points) veya geçerli alan koordinatları gerekli' }, { status: 400 });
    }

    const aiEngineUrl = process.env.NEXT_PUBLIC_AI_ENGINE_URL || 'http://localhost:8000';

    // DÜZELTME: Vezne (FastAPI) için payload'a bbox'ı ekliyoruz
    const payload = {
      start_points,
      end_points: end_points || [],
      buffer_meters: buffer_meters || 1000,
      region_name: region_name || null,
      user_id: userId || null,
      bbox: bbox || null, 
    };

    const controller = new AbortController();
    // Timeout süresini sadece Vezne'nin kuyruğa alma süresi için kısa tutabiliriz
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      // FastAPI'nin asenkron kuyruk endpointine (Vezne) istek atıyoruz
      const response = await fetch(`${aiEngineUrl}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`AI Engine analiz baslatma hatasi: ${response.status}`);
      }

      const data = await response.json(); // Burada sadece { task_id, message } dönecek

      const firstPoint = start_points[0];
      // Standart anahtar lon; eski istemciler icin lng/longitude toleransı korunur
      const lon = firstPoint.lon ?? firstPoint.lng ?? firstPoint.longitude;

      // Frontend'e FastAPI'den gelen task_id'yi dönüyoruz ki sorgulamaya başlasın
      return NextResponse.json(data);

    } catch(error) {
      clearTimeout(timeout);

      await sendSystemTelegramNotification(
        `Vezneye (FastAPI) bağlanırken hata oluştu: ${error.message}`,
        'Sistem Bağlantı Hatası'
      );

      return NextResponse.json({ error: 'Vezneye ulaşılamadı' }, { status: 502 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'İstek işlenirken hata oluştu' }, { status: 500 });
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const aiEngineUrl = process.env.NEXT_PUBLIC_AI_ENGINE_URL || 'http://localhost:8000';

  // task_id varsa Polling (Durum Sorgulama) işlemi yap
  const taskId = searchParams.get('task_id');

  if (taskId) {
    try {
      const response = await fetch(`${aiEngineUrl}/api/status/${taskId}`);

      if (!response.ok) {
        throw new Error(`AI Engine hata döndü: ${response.status}`);
      }

      const statusData = await response.json();

      return NextResponse.json(statusData);
    } catch (error) {
       return NextResponse.json({ error: 'Durum sorgulanamadı' }, { status: 500 });
    }
  }

  // --- ESKİ SİSTEM GİBİ SADECE LAT/LON GELDİYSE ---
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

    if (!response.ok) {
      throw new Error(`Uydu servisi hata döndü: ${response.status}`);
    }

    const satelliteData = await response.json();

    await sendSystemTelegramNotification(
      `👀 Koordinat: ${lat}, ${lon}\nBölge harita üzerinde görüntülendi.`,
      'Harita Görüntüleme Raporu'
    );

    return NextResponse.json({ status: 'completed', satellite: satelliteData });
  } catch (error) {
    await sendSystemTelegramNotification(
      `Uydu servisi cevap vermediği için analiz sırasında bir hata oluştu: ${error.message}`,
      'Analiz Hatası'
    );
    return NextResponse.json({ error: 'Uydu verisi alınamadı' }, { status: 500 });
  }
}