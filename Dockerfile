FROM oven/bun:1-alpine AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

COPY . .

RUN bun build --compile --outfile /app/baba ./src/index.ts

FROM alpine:latest

RUN apk add --no-cache libstdc++ libgcc dmidecode util-linux procps iproute2 smartmontools

WORKDIR /app

COPY --from=build /app/baba /app/baba

CMD ["/app/baba", "start"]
