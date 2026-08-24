# GeoMorphosis — Yapay Zekâ Katmanı
## Sunum Konuşma Metni

> **Süre:** ~10 dakika
> **Kapsam:** FastAPI + YOLOv8 + Google Earth Engine
> **Durum:** 58/58 test geçiyor

Her bölümde **⏱ zaman kodu**, *ekranda ne olmalı* bilgisi ve söylenecek metin var.

---

## ⏱ 0:00 — Çözmeye çalıştığımız problem

*Ekran: harita ana sayfası*

Türkiye'de bir orman alanının yıllar içinde ne kadar küçüldüğünü, bir körfezin ne kadar kirlendiğini öğrenmek istediğinizde karşınıza iki seçenek çıkıyor: ya sahaya gideceksiniz, ya da uydu görüntülerini tek tek indirip elle karşılaştıracaksınız. İkisi de ölçeklenmiyor.

GeoMorphosis'in yapay zekâ katmanı bu işi otomatikleştiriyor. Kullanıcı haritadan bir bölge seçiyor; sistem o bölgenin **geçmiş yıllara ait uydu görüntülerini indiriyor**, aralarındaki değişimi ölçüyor ve sonucu hem sayı hem görsel olarak veriyor.

Bugün size bu katmanın nasıl çalıştığını anlatacağım: veriyi nereden aldığımızı, neyi nasıl ölçtüğümüzü ve şu anda nerede olduğumuzu.

---

## ⏱ 1:00 — Veri: Sentinel-2 ve Google Earth Engine

*Ekran: bölge seçimi → analiz başlıyor*

Veriyi **Google Earth Engine** üzerinden çekiyoruz. Kaynağımız Avrupa Uzay Ajansı'nın **Sentinel-2** uydusu — 10 metre çözünürlük, beş günde bir aynı noktanın üzerinden geçiyor.

Seçilen koordinatın etrafında bir kilometrelik tampon alan oluşturuyoruz ve **2020, 2023, 2025** yılları için birer görüntü indiriyoruz. Bulut oranı %15'in üzerinde olan görüntüleri eliyoruz; kalanların medyanını alıyoruz, böylece tek bir günün bulutu ya da gölgesi sonucu bozmuyor.

Her yıl için iki kare üretiyoruz: gözle görülebilen **RGB** karesi ve bitki örtüsünü ölçen **NDVI** karesi. Hepsi 512×512 piksel.

> **Ekip notu**
> Veri seti tarafında Marmara Bölgesi için 2010–2025 arasını kapsayan çok uydulu bir toplayıcı yazıldı: 2015 sonrası Sentinel-2, 2013–2014 Landsat 8, 2010–2012 Landsat 7. Sentinel-2 2015'te göreve başladığı için daha eski yıllar ancak böyle kapsanabiliyor.

---

## ⏱ 2:30 — Ölçüm: NDVI ve değişim tespiti

*Ekran: NDVI değişim grafiği*

NDVI, bitki örtüsü indeksi. Bitkiler kızılötesi ışığı yansıtır, kırmızıyı yutar; bu iki bandın farkını oranlayarak bir alanın ne kadar yeşil olduğunu sayıya çeviriyoruz. Formülü basit:

```
NDVI = (B8 − B4) / (B8 + B4)      B8: kızılötesi, B4: kırmızı
```

Değer −1 ile +1 arasında. Su negatif, çıplak toprak sıfıra yakın, yoğun orman 0.6 üzeri.

Asıl iş burada başlıyor: **2020 ve 2025 karelerinin NDVI'larını piksel piksel çıkarıyoruz.** Bir pikselde düşüş 0.25'i geçmişse orada bitki örtüsü kaybı var diyoruz. Kaç pikselde olduğunu sayıp alana oranlıyoruz — çıkan sayı ekrandaki "bitki örtüsü kaybı" yüzdesi.

Aynı yöntemle su yüzeylerini de takip ediyoruz: 2020'de su olup 2025'te karaya dönmüş pikseller göl küçülmesini veriyor.

| Kahramanmaraş | Bitki kaybı | Su çekilmesi |
|---|---|---|
| NDVI 0.27 → 0.21 | %11.05 | %29.6 |

Bu rakamlar gerçek bir çalıştırmadan; Kahramanmaraş bölgesi, canlı Sentinel-2 verisiyle.

---

## ⏱ 4:00 — Nesne tespiti: YOLOv8

*Ekran: tespit kutuları / model logu*

NDVI bize "ne kadar değişti" diyor ama "nerede, ne var" demiyor. Onun için en güncel RGB karesini bir **YOLOv8** modeline veriyoruz. Model iki sınıf tanıyor: yangın ve kirlilik. Bulduğu her alanı kutu ve güven skoruyla döndürüyor.

Kutuların koordinatları görüntünün piksel uzayında geldiği için arayüzde uydu karesinin tam üstüne çizebiliyoruz — kullanıcı modelin neye baktığını görüyor.

Kirlilik oranını da bu kutulardan hesaplıyoruz: kutuların kapladığı alanın toplam kareye oranı. Böylece "Yok / Var" yerine **gerçek bir yüzde** gösteriyoruz.

> **Tasarım kararı**
> Model ağırlığı bulunamazsa sistem çökmüyor. `model_loaded: false` bayrağıyla devam ediyor, risk değerlerini yalnızca NDVI'dan türetiyor ve arayüz kullanıcıya bunu açıkça söylüyor. Aynı şey uydu verisi için de geçerli: `demo_mode`.

---

## ⏱ 5:15 — Görselleştirme: rakamı gözle doğrulatmak

*Ekran: kaydıraçlı karşılaştırma → değişim haritası*

Bir kullanıcıya "bölgenizde %11 bitki kaybı var" demek yeterli değil; buna inanması için görmesi lazım. İki şey yapıyoruz.

Birincisi **önce–sonra kaydıracı**: 2020 ve 2025 kareleri üst üste duruyor, ortadaki tutamağı sürükleyerek aynı pikselleri karşılaştırıyorsunuz.

İkincisi **değişim haritası**: iki yılın NDVI farkını renklendiriyoruz. Kırmızı bitki kaybı, yeşil artış, değişmeyen alan saydam — böylece uydu görüntüsünün üstüne bindirilebiliyor.

> **Burada bir tuzağa düştük**
> Haritayı ilk yazdığımızda 0.05 eşiğiyle boyuyorduk, kayıp yüzdesi ise 0.25 eşiğiyle sayılıyordu. Sonuç: harita %40 kırmızı gösterirken panel %11 yazıyordu — görsel, rakamı yalanlıyordu. Eşiği tek bir sabite bağladık; şimdi ikisi de %11.05.

---

## ⏱ 6:30 — Mimari: neden kuyruk kullanıyoruz

*Ekran: mimari diyagramı*

Bir analiz 30 saniye ile bir dakika arası sürüyor — uydu görüntüsü indirmek zaman alıyor. Kullanıcıyı bu süre boyunca bekleyen bir HTTP isteğinin ucunda tutamayız; bağlantı kopar.

Bu yüzden işi ikiye böldük. FastAPI isteği alıp **Redis kuyruğuna** atıyor ve anında bir fiş numarası dönüyor. Node.js worker kuyruktan görevi çekip analizi çalıştırıyor. Arayüz üç saniyede bir "hazır mı" diye soruyor.

```
Tarayıcı → FastAPI → Redis kuyruğu
                        ↓
     Analytics ← Redis ← Worker → /internal/analyze
                                   (indir + YOLO + NDVI)
```

Servis yedi endpoint sunuyor. Bunlardan biri uydu karelerini arayüze taşıyor — **dosya adını istemciden almıyoruz**; koordinat ve yıldan sunucu tarafında üretiyoruz, böylece dizin gezinme açığı hiç oluşmuyor.

| Endpoint | Servis modülü | Python satırı |
|---|---|---|
| 7 | 5 | 3.422 |

---

## ⏱ 7:45 — Mühendislik tarafı

*Ekran: test çıktısı / imaj boyutu*

Servisin arkasında **58 test** var: risk türetme mantığı, uydu indirme dalları, HTTP katmanı, değişim haritasının renk kuralları. Hepsi geçiyor.

Docker imajını **9.5 GB'dan 3.0 GB'a** indirdik. Sebep şuydu: YOLO kütüphanesi PyTorch'u CUDA destekli çekiyordu, ama konteynerde ekran kartı yok. **3.4 GB'lık CUDA paketi hiç çalışmadan duruyordu.** CPU sürümüne geçtik.

Bir de imaja gömülü kalan Google Earth Engine servis anahtarını çıkardık — imajı alan herkes o anahtarı da almış oluyordu.

| İmaj | Atılan CUDA | Test |
|---|---|---|
| 9.5 → 3.0 GB | 3.4 GB (kullanılmıyordu) | 58, hepsi geçiyor |

---

## ⏱ 8:45 — Şu anda neredeyiz

*Ekran: eğitim metrikleri / confusion matrix*

Burada dürüst olmak istiyorum, çünkü bu projenin en öğretici kısmı.

NDVI tarafı çalışıyor — gördüğünüz bitki kaybı ve su çekilmesi rakamları gerçek uydu verisinden geliyor. **Nesne tespit modeli ise henüz çalışmıyor.**

Bunu tahminle değil ölçerek bulduk. Modeli gerçek karolara verdiğimizde en yüksek güven skoru binde 3 çıkıyordu. Eğitim kayıtlarına baktık: veri setinde **tek bir kirlilik örneği yoktu** — model o sınıfı hiç görmemişti. Yangın etiketleri de rastgeleydi; eğitim sırasında bile 38 binden fazla yanlış alarm veriyordu.

Kök neden etiketlemedeydi: etiketler hazır bir nesne tanıma modeliyle üretilmişti, o model de uydu görüntüsünde insan ve bisiklet arıyordu.

> **Bu yüzden ne yaptık**
> Etiketleme sürecini baştan yazdık. Yeni araç, NDVI ve NDWI görüntülerindeki renk kurallarını kullanarak etiket üretiyor — yani "burası su, burası bitki" bilgisini indeksin kendisinden çıkarıyor. Marmara Bölgesi için ormansızlaşma ve kirlilik veri setleri toplandı; eğitim bu veriyle yeniden yapılacak.

---

## ⏱ 9:30 — Kapanış

*Ekran: analiz paneli, tam görünüm*

Özetle: haritadan seçilen bir bölge için uydu görüntüsü iniyor, yıllar arası değişim ölçülüyor, sonuç hem yüzde hem görsel olarak sunuluyor ve PDF rapora dönüştürülebiliyor. Sistem, verinin ya da modelin eksik olduğu durumlarda çökmek yerine bunu kullanıcıya söylüyor.

Önümüzdeki adım net: yeni veri setiyle modeli eğitmek ve nesne tespitini de NDVI kadar güvenilir hale getirmek.

---

# Gelebilecek sorular

### Neden Sentinel-2? Daha yüksek çözünürlüklü uydular var.

Ücretsiz ve açık veri sunması, beş günlük tekrar süresi ve kızılötesi bandı taşıması belirleyici oldu. NDVI hesabı için kızılötesi şart; ticari yüksek çözünürlüklü uyduların çoğu bunu ücretli sunuyor. 10 metre, orman ve su kütlesi ölçeğindeki değişim için yeterli.

### Bulut varsa ölçüm bozulmaz mı?

İki katmanlı koruma var. Bulut oranı %15'i geçen görüntüleri hiç almıyoruz, kalanların da medyanını alıyoruz. Medyan, tek bir karedeki bulut ya da gölgeyi baskılıyor. Yine de uygun görüntü bulunamazsa o yıl atlanıyor ve sonuçta hangi yılların kullanıldığı belirtiliyor.

### %11 kayıp rakamına neden güvenelim?

Çünkü aynı eşikle üretilmiş haritayı da gösteriyoruz. Panelde yazan yüzde ile haritadaki kırmızı alanın oranı birebir aynı — ölçtük, %11.05'e karşı %11.05. Kullanıcı sayıyı gözle doğrulayabiliyor.

### Model çalışmıyorsa bu proje ne işe yarıyor?

Modelin katkısı nesne tespitinde; değişim ölçümü ondan bağımsız çalışıyor. Bitki örtüsü kaybı, su çekilmesi ve NDVI değişimi tamamen uydu verisinden hesaplanıyor ve bugün gerçek sonuç üretiyor. Model devreye girdiğinde bunun üzerine "nerede yangın, nerede kirlilik" bilgisi eklenecek.

### Analiz ne kadar sürüyor, ölçeklenir mi?

Bölge başına 30–60 saniye; sürenin çoğu uydu görüntüsü indirmekte geçiyor. Kuyruk mimarisi sayesinde eş zamanlı istekler birikmeden sıraya giriyor ve worker sayısını artırarak yatay ölçekleme yapılabiliyor. İndirilen kareler önbelleğe alındığı için aynı bölge tekrar sorgulandığında görüntüler yeniden inmiyor.

### Kirlilik yüzdesi tam olarak neyi ölçüyor?

Modelin kirlilik olarak işaretlediği alanların toplam görüntüye oranını. Yani "bölgenin yüzde kaçı kirlilik olarak tespit edildi" sorusunun cevabı. Kutular üst üste binerse çift saymıyoruz.
