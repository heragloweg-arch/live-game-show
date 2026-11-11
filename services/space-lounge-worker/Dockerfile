FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY licenses ./licenses
COPY NOTICE.md ./NOTICE.md
ENV PORT=8080
EXPOSE 8080
CMD ["npm", "start"]
