FROM oven/bun:1.2.23-alpine

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY server.ts api.ts ./
COPY api ./api
COPY db ./db
COPY tools ./tools
COPY static ./static

ENV UI_HOST=0.0.0.0
ENV UI_PORT=8093

EXPOSE 8093

CMD ["bun", "run", "start"]
