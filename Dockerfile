FROM node:20-alpine AS build
WORKDIR /app

# Railway يمرّر المتغيرات كـ build-args — نثبتها صراحة لـ Vite
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_LIVEKIT_URL
ARG VITE_ENABLE_LOCAL_DEMO=false
ARG VITE_ENVIRONMENT=production
ARG VITE_APP_NAME=قدها

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_LIVEKIT_URL=$VITE_LIVEKIT_URL
ENV VITE_ENABLE_LOCAL_DEMO=$VITE_ENABLE_LOCAL_DEMO
ENV VITE_ENVIRONMENT=$VITE_ENVIRONMENT
ENV VITE_APP_NAME=$VITE_APP_NAME

COPY package.json package-lock.json* .npmrc* ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g serve@14
COPY --from=build /app/dist ./dist
CMD ["sh", "-c", "serve -s dist -l tcp://0.0.0.0:${PORT:-3000}"]
