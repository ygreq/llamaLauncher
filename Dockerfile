# Stage 1: Build the frontend
FROM node:20-bookworm AS build-frontend
WORKDIR /app
COPY package*.json ./
COPY frontend/package*.json ./frontend/
RUN npm install
RUN npm install --prefix frontend
COPY frontend/ ./frontend/
RUN npm run build

# Stage 2: Final runner image
FROM node:20-bookworm-slim
WORKDIR /app

# Install git (required for Obsidian vault auto-sync) and curl
RUN apt-get update && apt-get install -y git curl && rm -rf /var/lib/apt/lists/*

# Copy precompiled llama-server from the official ghcr.io/ggml-org/llama.cpp image
COPY --from=ghcr.io/ggml-org/llama.cpp:server /app/llama-server /usr/local/bin/llama-server

# Copy package descriptors and install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy built frontend assets
COPY --from=build-frontend /app/frontend/dist ./frontend/dist

# Copy backend files and default configurations
COPY server.js ./
COPY categories.json ./
COPY linkprocessor/ ./linkprocessor/

# Set up environment variables
ENV PORT=3000
ENV LLAMA_SERVER_PATH=/usr/local/bin/llama-server
ENV NODE_ENV=production
ENV CONFIG_PATH=/config/config.json
ENV HISTORY_FILE=/config/processed_history.json
ENV CATEGORIES_FILE=/config/categories.json

# Expose ports
EXPOSE 3000

# Set default volumes for persistence
VOLUME ["/config", "/models", "/obsidian"]

CMD ["node", "server.js"]
