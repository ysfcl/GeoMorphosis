FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN apk add --no-cache python3 make g++

RUN npm install

COPY . .

RUN npx prisma generate --schema=./prisma/schema.prisma

EXPOSE 3000

CMD ["npm", "run", "dev"]