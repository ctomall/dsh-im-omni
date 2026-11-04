FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY migrations ./migrations
COPY scripts ./scripts
EXPOSE 8090
CMD ["node", "src/server.mjs"]
