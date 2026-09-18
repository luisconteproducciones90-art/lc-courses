FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM base AS release
COPY src/ ./src/
EXPOSE 4000
USER node
CMD ["node", "src/index.js"]
