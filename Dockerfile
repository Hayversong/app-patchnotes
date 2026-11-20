# Frontend do Patchnotes (Next.js). As variáveis abaixo entram no build:
# - API_URL: para onde o rewrite /api/* encaminha (dentro do compose, o serviço "backend").
# - NEXT_PUBLIC_CHAT_WS_URL: endereço do WebSocket visto pelo NAVEGADOR (porta publicada no host).
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
ARG API_URL=http://backend:8000
ARG NEXT_PUBLIC_CHAT_WS_URL=ws://localhost:8000/ws/chat
ENV API_URL=$API_URL \
    NEXT_PUBLIC_CHAT_WS_URL=$NEXT_PUBLIC_CHAT_WS_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/next.config.mjs ./
USER node
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
