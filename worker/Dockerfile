# Node.js tabanlı hafif bir imaj kullanıyoruz
FROM node:22-alpine

# Çalışma dizinini belirliyoruz
WORKDIR /app

# Bağımlılıkları kopyalayıp kuruyoruz (Önce paket dosyaları, cache avantajı için)
COPY package*.json ./
RUN npm install

# Geri kalan tüm proje dosyalarını kopyalıyoruz
COPY . .

# Konteyner başlatıldığında çalışacak komut
CMD ["npm", "start"]