FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run typecheck && npm run lint && npm test -- --run && npm run build && node scripts/verify-production.mjs

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4173
RUN npm install --global serve@14.2.4
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts/write-runtime-config.mjs ./scripts/write-runtime-config.mjs
EXPOSE 4173
CMD ["sh", "-c", "node scripts/write-runtime-config.mjs && serve -s dist -l tcp://0.0.0.0:${PORT:-4173}"]
