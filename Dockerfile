FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --include=dev && npm cache clean --force
COPY . .
RUN npx tsc --noEmit
CMD ["node_modules/.bin/tsx", "src/index.ts"]
