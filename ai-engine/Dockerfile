FROM python:3.11-slim

WORKDIR /app

# CPU-only PyTorch, ultralytics'ten ONCE kuruluyor.
# Aksi halde ultralytics torch'u PyPI'dan CUDA'li olarak cekiyor ve konteynerde
# GPU olmamasina ragmen ~3.4 GB olu agirlik geliyor (nvidia/* 2.7 GB + triton 691 MB).
# Torch burada zaten karsilandigi icin sonraki adim CUDA surumunu indirmiyor.
RUN pip install --no-cache-dir --default-timeout=1000 \
        --index-url https://download.pytorch.org/whl/cpu \
        torch torchvision

COPY requirements.txt .
RUN pip install --no-cache-dir --default-timeout=1000 -r requirements.txt

# Calisma zamani sistem kutuphaneleri:
#  - libexpat1: rasterio'nun tasidigi GDAL bunu ariyor, yoksa NDVI okunamiyor
#  - libgl1/libglib2.0-0/libsm6/libxext6/libxrender-dev/libxcb1: ultralytics
#    kendi bagimliligi olarak GUI'li opencv-python cekiyor, o da bu X11
#    kutuphanelerini istiyor; yoksa "ImportError: libxcb.so.1" ile YOLO yuklenmiyor
# Bilerek pip'ten SONRA duruyor: paketler hazir wheel'den kuruldugu icin
# kurulum aninda bu kutuphanelere ihtiyac yok, boylece agir pip katmani
# (torch/ultralytics, ~2.5 GB) onbellekte kaliyor.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libexpat1 \
        libgl1 \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender1 \
        libxcb1 \
    && rm -rf /var/lib/apt/lists/*

# Kaynak kodu imaja al. docker-compose gelistirme sirasinda bu dizini
# volume ile eziyor; bu satir imajin tek basina calisabilmesi icin gerekli.
COPY . .

EXPOSE 8000

# Railway gibi platformlar uygulamaya PORT env'i verir; lokalde 8000'e dusar.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
