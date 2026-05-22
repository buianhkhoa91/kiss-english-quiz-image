FROM node:20-slim

RUN apt-get update && apt-get install -y \
    chromium \
    fonts-noto \
    fonts-noto-color-emoji \
    fonts-noto-cjk \
    fonts-liberation \
    ca-certificates \
    --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
