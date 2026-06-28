# Configuration Reference

All settings below can be placed in `config.json` at the project root.
Unknown fields are **rejected** — use the exact key names shown.
Every field is optional (defaults are applied) except `notifiers`.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `$schema` | string | — | — |
| `machineName` | string | — | — |
| `logLevel` | `trace` \| `debug` \| `info` \| `warn` \| `error` | `info` | — |
| `intervalSeconds` | number | `60` | — |
| `reminderIntervalMinutes` | number | `30` | — |
| `database.path` | string | `./tmp/baba.db` | — |
| `checks.cpu.enabled` | boolean | `true` | — |
| `checks.cpu.usageThresholdPercent` | number | `90` | — |
| `checks.cpu.consecutiveBreaches` | integer | `3` | — |
| `checks.load.enabled` | boolean | `true` | — |
| `checks.load.threshold` | number | `8` | — |
| `checks.load.consecutiveBreaches` | integer | `3` | — |
| `checks.memory.enabled` | boolean | `true` | — |
| `checks.memory.usageThresholdPercent` | number | `90` | — |
| `checks.memory.consecutiveBreaches` | integer | `3` | — |
| `checks.disk.enabled` | boolean | `true` | — |
| `checks.disk.usageThresholdPercent` | number | `90` | — |
| `checks.disk.volumes` | string[] | `["/"]` | — |
| `checks.temperature.enabled` | boolean | `false` | — |
| `checks.temperature.cpuThresholdCelsius` | number | `85` | — |
| `checks.temperature.gpuThresholdCelsius` | number | `85` | — |
| `checks.temperature.consecutiveBreaches` | integer | `3` | — |
| `checks.gpu.enabled` | boolean | `false` | — |
| `checks.gpu.vramThresholdPercent` | number | `90` | — |
| `checks.gpu.consecutiveBreaches` | integer | `3` | — |
| `notifiers` | object \| object[] | — | — |

## Minimal `config.json`

```json
{
  "$schema": "./schema/config.schema.json",
  "notifiers": [
    { "type": "discord", "webhookUrl": "https://discord.com/api/webhooks/…" }
  ]
}
```

## Full example with all fields

See `config.example.json` in the repository root.
