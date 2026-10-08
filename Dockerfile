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
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts/write-runtime-config.mjs ./scripts/write-runtime-config.mjs
COPY --from=build /app/scripts/static-server.mjs ./scripts/static-server.mjs
EXPOSE 4173
CMD ["sh", "-c", "node scripts/write-runtime-config.mjs && node scripts/static-server.mjs"]
