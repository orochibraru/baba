# Docker

The `orochibraru/baba` image (linux/amd64 and linux/arm64) runs `baba start` and
checks its own health with `baba health`. It needs to see the host, not the
container, so it runs privileged in the host's PID and network namespaces.

## Docker Compose

```bash
curl -o config.json https://raw.githubusercontent.com/orochibraru/baba/main/config.example.json
curl -o compose.yaml https://raw.githubusercontent.com/orochibraru/baba/main/compose.example.yaml
# edit config.json: at least one notifier
docker compose up -d
```

The compose file mounts `config.json` at `/app/config.json` and a volume at
`/app/tmp` for the incident history. The image points baba there with
`BABA_CONFIG_PATH=/app/config.json` and
`BABA_DATABASE_PATH=/app/tmp/incidents.json`.

`BABA_DATABASE_PATH` overrides `database.path` from `config.json`: in the
container, the history always lives in `/app/tmp`.

## docker run

With a config file:

```bash
docker run -d \
  --name baba \
  --restart unless-stopped \
  --privileged --pid=host --network=host \
  -v /sys:/sys:ro \
  -v /dev:/dev:ro \
  -v /path/to/config.json:/app/config.json:ro \
  -v /path/to/data:/app/tmp \
  orochibraru/baba:latest
```

With environment variables only: without a config file, baba starts from the
defaults and the `BABA_*` variables, and only needs a notifier.

```bash
docker run -d \
  --name baba \
  --restart unless-stopped \
  --privileged --pid=host --network=host \
  -v /sys:/sys:ro \
  -v /dev:/dev:ro \
  -v /path/to/data:/app/tmp \
  -e BABA_NOTIFIERS_DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/<id>/<token> \
  orochibraru/baba:latest
```

Every variable is in [Environment variables](env.md).

## Why these flags

| Flag              | Reason                                                                   |
| ----------------- | ------------------------------------------------------------------------ |
| `--privileged`    | Access to hardware sensors (temperature)                                 |
| `--pid=host`      | Shares the host PID namespace so `/proc` reflects host-wide CPU and load |
| `--network=host`  | Reaches the notifiers through the host's network                         |
| `-v /sys:/sys:ro` | Read-only access to the kernel's hwmon sensors and thermal zones         |
| `-v /dev:/dev:ro` | Device access for disk stats                                             |
| `-v …:/app/tmp`   | Persists the incident history across restarts                            |

## Disks in a container

The disk check reads the container's own mount table, so it only sees what's
mounted into the container. To watch a host disk, mount it and list its path
inside the container:

```yaml
volumes:
  - /mnt/data:/host/data:ro
environment:
  BABA_DISK_VOLUMES: /,/host/data
```

## Tags

| Tag                           | What                              |
| ----------------------------- | --------------------------------- |
| `latest`, `X`, `X.Y`, `X.Y.Z` | Stable releases                   |
| `canary`, `X.Y.Z-canary.N`    | Builds of `main` between releases |

## What doesn't work in Docker

- `baba install`, `baba restart`, `baba uninstall` and `baba update`: the
  container's restart policy is the service, and a new image is the update.
- `baba logs`: use `docker logs -f baba`.
- The GPU check needs `nvidia-smi` inside the container. The image is Alpine
  (musl), and NVIDIA's container toolkit mounts a glibc build of it, so expect
  the GPU check to find nothing.
