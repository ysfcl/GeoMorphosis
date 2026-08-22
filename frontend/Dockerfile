FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

# better-sqlite3 native modulunu derlemek icin derleme araclari gerekli
RUN apk add --no-cache python3 make g++

RUN npm install

COPY . .

# Build context ./frontend oldugu icin schema yolu konteyner iciyle eslesmeli:
# /app/prisma/schema.prisma (onceki "./frontend/prisma/..." yolu build'i patlatiyordu)
RUN npx prisma generate --schema=./prisma/schema.prisma

ENV NEXT_TELEMETRY_DISABLED=1

# Production build. NEXT_PUBLIC_* degiskenleri BUILD aninda imajla gömuldugunden
# Railway'de bu degiskenler ilk deploy'dan ONCE girilmelidir.
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
