# Baba

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Latest Release](https://img.shields.io/github/v/release/orochibraru/baba)
![Docker Pulls](https://img.shields.io/docker/pulls/orochibraru/baba)

[Docs](docs/README.md) · [Docker Hub](https://hub.docker.com/r/orochibraru/baba)
· [Releases](https://github.com/orochibraru/baba/releases)

> Named after the lookout pirate in the French comic book _Astérix_, always
> watching for trouble on the horizon.

> [!CAUTION]
>
> While the app's version is more than 1.x it's still in beta and may contain
> bugs. It won't impact your system but I can't guarantee it's reliable yet
> until I have long term data to prove it.

Baba is a lightweight homelab monitor that sends Discord or Telegram alerts when
something goes wrong — and tells you when it's fixed.

## What it does

- Watches **CPU usage**, **system load**, **memory**, **disk**, **CPU/GPU
  temperature**, and **GPU utilization**
- Alerts via **Discord** and/or **Telegram** (multiple notifiers supported)
- **Deduplicates**: opens an incident only on the Nth consecutive breach — no
  per-cycle spam
- **Recovery alerts**: notifies you when a metric returns to normal
- **Reminders**: re-alerts at a configurable interval while an incident stays
  open
- Stores full **incident history** in a local JSON file
- One static binary (about 7 MB, 3 MB gzipped), no runtime or dependencies

## Run it

### Install script (Linux / macOS)

```bash
curl -fsSL https://github.com/orochibraru/baba/releases/latest/download/install.sh | sh
baba setup      # wizard: notifiers and thresholds
baba validate   # send a test alert
baba install    # background service (launchd on macOS, systemd on Linux)
```

Details in [Getting started](docs/getting-started.md).

### Docker Compose

```bash
curl -o config.json https://raw.githubusercontent.com/orochibraru/baba/main/config.example.json
curl -o compose.yaml https://raw.githubusercontent.com/orochibraru/baba/main/compose.example.yaml
# edit config.json: at least one notifier
docker compose up -d
```

Flags, env-only setup and disks in a container: [Docker](docs/docker.md).

## Documentation

- [Getting started](docs/getting-started.md) and [Docker](docs/docker.md)
- [Configuration file](docs/config.md) and [environment variables](docs/env.md)
- [Checks](docs/checks.md): what's measured, and how, on Linux and macOS
- [Notifiers](docs/notifiers.md): Discord and Telegram
- [Background service](docs/service.md), [incidents](docs/incidents.md),
  [CLI reference](docs/commands.md), [updates](docs/updates.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Architecture](docs/architecture.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT, see [LICENSE](LICENSE).
