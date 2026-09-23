FROM golang:1.27.1-alpine AS build
ARG APP_VERSION=dev
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=${APP_VERSION}" -o /baba ./cmd/baba

FROM alpine:3.24
RUN apk add --no-cache ca-certificates
COPY --from=build /baba /app/baba
WORKDIR /app
# Where the compose files mount the config and the data volume.
ENV BABA_CONFIG_PATH=/app/config.json BABA_DATABASE_PATH=/app/tmp/incidents.json

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD ["/app/baba", "health"]

ENTRYPOINT ["/app/baba"]
CMD ["start"]
