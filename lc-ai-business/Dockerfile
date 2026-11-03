# LC-AI BUSINESS — imagen única: API + frontend estático (mismo origen).
# Build desde esta carpeta:  docker build -t lc-ai-business .
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production FRONTEND_DIR=/app/frontend PORT=4000
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev
COPY backend ./backend
COPY frontend ./frontend
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:4000/health || exit 1
WORKDIR /app/backend
CMD ["node", "src/server.js"]
