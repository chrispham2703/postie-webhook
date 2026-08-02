FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev
RUN npx prisma generate

COPY src ./src

# Overridden per service at deploy time:
#   api           -> node src/app.js
#   worker        -> node src/workers/deliveryWorker.js
#   retry-poller  -> node src/workers/retryPoller.js
#   recovery-scan -> node src/workers/recoveryScan.js
CMD ["node", "src/app.js"]
