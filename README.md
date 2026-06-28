# Baba

> Named after the lookout pirate in the French comic book *Astérix* — always watching for trouble on the horizon.

Baba is a lightweight homelab monitor that sends Discord or Telegram alerts when something goes wrong — and tells you when it's fixed.

## What it does

- Watches **CPU usage**, **system load**, **memory**, **disk**, **CPU/GPU temperature**, and **GPU utilization**
- Alerts via **Discord** and/or **Telegram** (multiple notifiers supported)
- **Deduplicates**: opens an incident only on the Nth consecutive breach — no per-cycle spam
- **Recovery alerts**: notifies you when a metric returns to normal
- **Reminders**: re-alerts at a configurable interval while an incident stays open
- Stores full **incident history** in a local SQLite database

## Quick start

Requires [Bun](https://bun.sh).

```bash
# 1. Install dependencies
bun install

# 2. Copy and edit config
cp config.example.json config.json
# At minimum, set your notifier webhook URL

# 3. Run
bun run dev

# Or build a self-contained binary and run it
bun run build && ./baba start
```

## Configuration

All settings live in `config.json`. The only required field is `notifiers` — everything else has a sensible default.

```json
{
  "$schema": "./schema/config.schema.json",
  "notifiers": [
    { "type": "discord", "webhookUrl": "https://discord.com/api/webhooks/…" }
  ]
}
```

The `$schema` field enables autocomplete and inline validation in VS Code and other editors that support JSON Schema.

See [`docs/config.md`](docs/config.md) for the full reference.

## CLI commands

| Command | Description |
|---|---|
| `./baba start` | Start the monitoring loop |
| `./baba setup` | Interactive setup wizard |
| `./baba validate` | Send a test alert to verify your notifiers |
| `./baba list incidents [-n N]` | List recent incidents (default: 50) |
| `./baba get incident <id>` | Show details and notifications for an incident |

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
