# Configuration Reference

All settings below can be placed in `config.json` at the project root.
Unknown fields are **rejected** — use the exact key names shown.
Every field is optional (defaults are applied) except `notifiers`.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `$schema` | string | — | — |
| `machineName` | string | — | Display name for this machine, prepended to every alert message. |
| `logLevel` | `trace` \| `debug` \| `info` \| `warn` \| `error` | `info` | Log verbosity. One of: `trace`, `debug`, `info`, `warn`, `error`. |
| `intervalSeconds` | number | `60` | Seconds between monitor check cycles. |
| `reminderIntervalMinutes` | number | `30` | Minutes before re-alerting for an ongoing incident. |
| `database.path` | string | `./tmp/baba.db` | Path to the SQLite incident database. |
| `checks.cpu.enabled` | boolean | `true` | Enable CPU usage monitoring. |
| `checks.cpu.usageThresholdPercent` | number | `90` | CPU usage % that triggers an alert. |
| `checks.cpu.consecutiveBreaches` | integer | `3` | Consecutive high readings before opening a CPU incident. |
| `checks.load.enabled` | boolean | `true` | Enable system load-average monitoring. |
| `checks.load.threshold` | number | `8` | 1-minute load average that triggers an alert. Rule of thumb: number of CPU cores. |
| `checks.load.consecutiveBreaches` | integer | `3` | Consecutive high readings before opening a load incident. |
| `checks.memory.enabled` | boolean | `true` | Enable memory usage monitoring. |
| `checks.memory.usageThresholdPercent` | number | `90` | Memory usage % that triggers an alert. |
| `checks.memory.consecutiveBreaches` | integer | `3` | Consecutive high readings before opening a memory incident. |
| `checks.disk.enabled` | boolean | `true` | Enable disk usage monitoring. |
| `checks.disk.usageThresholdPercent` | number | `90` | Disk usage % that triggers an alert. |
| `checks.disk.volumes` | string[] | `["/"]` | Comma-separated mount points to monitor. |
| `checks.temperature.enabled` | boolean | `false` | Enable temperature monitoring (CPU + all GPUs). Off by default; most values are null on macOS. |
| `checks.temperature.cpuThresholdCelsius` | number | `85` | CPU temperature (°C) that triggers an alert. |
| `checks.temperature.gpuThresholdCelsius` | number | `85` | GPU temperature (°C) that triggers an alert. |
| `checks.temperature.consecutiveBreaches` | integer | `3` | Consecutive high readings before opening a temperature incident. |
| `checks.gpu.enabled` | boolean | `false` | Enable GPU utilization monitoring. Off by default; metrics unavailable on macOS. |
| `checks.gpu.vramThresholdPercent` | number | `90` | GPU utilization % that triggers an alert. |
| `checks.gpu.consecutiveBreaches` | integer | `3` | Consecutive high readings before opening a GPU incident. |
| `notifiers` | NotifierConfig[] | **required** | One or more notification destinations. See [Notifiers](#notifiers) below. |

## Notifiers

`notifiers` is a required array. Each entry must have a `"type"` field that selects the notifier. You can list multiple destinations of different types.

### Discord

Sends alerts to a Discord channel via an incoming webhook.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `discord` | — |
| `webhookUrl` | string | Webhook URL from Discord → Channel Settings → Integrations → Webhooks. |

```json
{
  "type": "discord",
  "webhookUrl": "https://discord.com/api/webhooks/<id>/<token>"
}
```

### Telegram

Sends alerts to a Telegram chat, group, or channel via a bot.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `telegram` | — |
| `botToken` | string | Token from @BotFather on Telegram. |
| `chatId` | string | Target chat. Use a user ID, a group ID (prefixed with `-`), or `@channelname`. |

```json
{
  "type": "telegram",
  "botToken": "123456789:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "chatId": "-1001234567890"
}
```

To find your Telegram chat ID: add [@userinfobot](https://t.me/userinfobot) to the chat, or forward a message from the chat to it.

## Minimal `config.json`

```json
{
  "$schema": "./schema/config.schema.json",
  "notifiers": [
    { "type": "discord", "webhookUrl": "https://discord.com/api/webhooks/<id>/<token>" }
  ]
}
```

## Full example with all fields

See `config.example.json` in the repository root.
