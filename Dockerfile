FROM node:20-slim AS base
ENV NODE_ENV=production
WORKDIR /app

# Install dependencies separately for better caching
FROM base AS deps
RUN apt-get update && \
	apt-get install -y python3 python3-dev make g++ && \
	rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* .npmrc* ./
RUN npm install --include=dev

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
COPY config ./config
 RUN npm run build

FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json* .npmrc* ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=build /app/cmp ./cmp
COPY config ./config

CMD ["node", "cmp/index.js"]
