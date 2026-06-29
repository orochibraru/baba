# Baba

> Named after the lookout pirate in the French comic book *Astérix*, always watching for trouble on the horizon.

Baba is a lightweight homelab monitor that sends Discord or Telegram alerts when something goes wrong — and tells you when it's fixed.

## What it does

- Watches **CPU usage**, **system load**, **memory**, **disk**, **CPU/GPU temperature**, and **GPU utilization**
- Alerts via **Discord** and/or **Telegram** (multiple notifiers supported)
- **Deduplicates**: opens an incident only on the Nth consecutive breach — no per-cycle spam
- **Recovery alerts**: notifies you when a metric returns to normal
- **Reminders**: re-alerts at a configurable interval while an incident stays open
- Stores full **incident history** in a local SQLite database

## Quick start

### Install script (Linux / macOS)

```bash
curl -fsSL https://github.com/orochibraru/baba/releases/latest/download/install.sh | sh
```

Detects your OS and architecture, installs the binary to `/usr/local/bin/baba`, creates `/var/lib/baba/`, and seeds `/var/lib/baba/config.json` from the default template if one doesn't already exist. Then:

```bash
baba setup   # interactive wizard — fill in your notifier credentials and thresholds
baba start
```

To install to a custom location: `INSTALL_DIR=~/.local/bin curl -fsSL … | sh`

### Docker Compose

```bash
# 1. Copy and edit config — at minimum, set your notifier webhook URL
curl -o config.json https://raw.githubusercontent.com/orochibraru/baba/main/config.example.json

# 2. Download the compose file
curl -o compose.yaml https://raw.githubusercontent.com/orochibraru/baba/main/compose.example.yaml

# 3. Run
docker compose up -d
```

### Binary (manual)

Download the binary for your platform from the [releases page](https://github.com/orochibraru/baba/releases), then:

```bash
# 1. Copy and edit config
curl -o config.json https://raw.githubusercontent.com/orochibraru/baba/main/config.example.json

# 2. Run
./baba start
```

## Docker

### Docker Compose (recommended)

The included `compose.yaml` handles all the required flags. Edit `config.json`, then:

```bash
docker compose up -d
```

### docker run

The image has no bundled config — pass it via a volume mount and `--config`, or configure everything through environment variables.

**With a config file:**

```bash
docker run -d \
  --name baba \
  --restart unless-stopped \
  --privileged --pid=host --network=host \
  -v /sys:/sys:ro \
  -v /dev:/dev:ro \
  -v /path/to/config.json:/config.json:ro \
  -v /path/to/data:/app/tmp \
  orochibraru/baba:latest start --config /config.json
```

**With environment variables only (no config file):**

```bash
docker run -d \
  --name baba \
  --restart unless-stopped \
  --privileged --pid=host --network=host \
  -v /sys:/sys:ro \
  -v /dev:/dev:ro \
  -v /path/to/data:/app/tmp \
  -e BABA_NOTIFIERS_DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/… \
  orochibraru/baba:latest
```

See the [Environment variables](#environment-variables) section for the full list of `BABA_*` variables.

### Why these flags?

| Flag | Reason |
|---|---|
| `--privileged` | Full access to hardware sensors (temperature, GPU) |
| `--pid=host` | Shares the host PID namespace so `/proc` reflects host-wide CPU and process stats |
| `--network=host` | Network interface stats match the host |
| `-v /sys:/sys:ro` | Read-only access to kernel hardware interfaces (hwmon, thermal zones) |
| `-v /dev:/dev:ro` | Device access for disk stats |
| `-v …:/app/tmp` | Persists the SQLite incident database across restarts |

## Data directory

All runtime files live in `/var/lib/baba/`:

| File | Purpose |
|---|---|
| `config.json` | Active configuration (edit or run `baba setup`) |
| `config.default.json` | Immutable template refreshed on each install — used to restore `config.json` if it's ever deleted |
| `baba.db` | SQLite incident history |

## Configuration

All settings live in `/var/lib/baba/config.json`. The only required field is `notifiers` — everything else has a sensible default.

```json
{
  "$schema": "https://raw.githubusercontent.com/orochibraru/baba/refs/heads/main/schema/config.schema.json",
  "notifiers": [
    { "type": "discord", "webhookUrl": "https://discord.com/api/webhooks/…" }
  ]
}
```

The `$schema` field enables autocomplete and inline validation in VS Code and other editors that support JSON Schema.

**Update notifications** are enabled by default: when `baba start` detects a newer release it sends a one-time alert through your configured notifiers. To opt out:

```json
{ "updates": { "notifyEnabled": false } }
```

See [`docs/config.md`](docs/config.md) for the full reference.

## CLI commands

| Command | Description |
|---|---|
| `baba start` | Start the monitoring loop |
| `baba setup` | Interactive setup wizard — writes `/var/lib/baba/config.json` |
| `baba update` | Check for a newer release and replace the binary in-place |
| `baba health` | Check the service is correctly configured and able to alert |
| `baba validate` | Send a test alert to verify your notifiers |
| `baba list incidents [-n N]` | List recent incidents (default: 50) |
| `baba get incident <id>` | Show details and notifications for an incident |

## Environment variables

Every config value can be overridden with a `BABA_*` environment variable — useful for containers and secrets managers. Values are applied before validation, so defaults and type coercion still work.

```bash
BABA_LOG_LEVEL=debug BABA_CPU_THRESHOLD=80 ./baba start
```

See [`docs/env.md`](docs/env.md) for the full list.

## Platform notes

**Temperature and GPU checks are disabled by default.** On macOS (Apple Silicon in particular), `systeminformation` returns `null` for most temperature and GPU utilization readings, so enabling them would produce no useful data. On Linux homelab servers these checks work as expected — enable them in `config.json`:

```json
{
  "checks": {
    "temperature": { "enabled": true },
    "gpu": { "enabled": true }
  }
}
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
