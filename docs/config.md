# Configuration file

All settings below live in `config.json` (`/var/lib/baba/config.json`, or
`--config`, or `BABA_CONFIG_PATH`). Unknown fields are ignored, so check the
spelling of every key. Every field is optional (defaults are applied) except
`notifiers`. Any value can also come from a `BABA_*`
[environment variable](env.md), which wins over the file.

`baba setup` writes this file for you; see
[Getting started](getting-started.md#2-configure).

| Key                                      | Type                                              | Default                        | Description                                                                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$schema`                                | string                                            | none                           | JSON Schema URL, for autocomplete and validation in editors. `baba setup` writes it.                                                                                                        |
| `machineName`                            | string                                            | the hostname                   | Display name for this machine, prepended to every alert message.                                                                                                                            |
| `logLevel`                               | `trace` \| `debug` \| `info` \| `warn` \| `error` | `info`                         | Log verbosity. One of: `trace`, `debug`, `info`, `warn`, `error`.                                                                                                                           |
| `intervalSeconds`                        | number                                            | `60`                           | Seconds between check cycles. Must be positive.                                                                                                                                             |
| `reminderIntervalMinutes`                | number                                            | `30`                           | Minutes between re-alerts while an incident stays open. Must be positive.                                                                                                                   |
| `database.path`                          | string                                            | `/var/lib/baba/incidents.json` | The JSON incident history. A SQLite `baba.db` from the TypeScript baba found there is moved aside to `<path>.sqlite.bak`. The service log and the update marker live in the same directory. |
| `checks.cpu.enabled`                     | boolean                                           | `true`                         | Enable CPU usage monitoring.                                                                                                                                                                |
| `checks.cpu.usageThresholdPercent`       | number                                            | `90`                           | CPU usage % that counts as a breach, 0 to 100.                                                                                                                                              |
| `checks.cpu.consecutiveBreaches`         | integer                                           | `3`                            | Consecutive breaches before a CPU incident opens, at least 1.                                                                                                                               |
| `checks.load.enabled`                    | boolean                                           | `true`                         | Enable system load-average monitoring.                                                                                                                                                      |
| `checks.load.threshold`                  | number                                            | `8`                            | 1-minute load average that counts as a breach. Rule of thumb: the number of CPU cores.                                                                                                      |
| `checks.load.consecutiveBreaches`        | integer                                           | `3`                            | Consecutive high readings before opening a load incident.                                                                                                                                   |
| `checks.memory.enabled`                  | boolean                                           | `true`                         | Enable memory usage monitoring.                                                                                                                                                             |
| `checks.memory.usageThresholdPercent`    | number                                            | `90`                           | Memory usage % that counts as a breach, 0 to 100.                                                                                                                                           |
| `checks.memory.consecutiveBreaches`      | integer                                           | `3`                            | Consecutive high readings before opening a memory incident.                                                                                                                                 |
| `checks.disk.enabled`                    | boolean                                           | `true`                         | Enable disk usage monitoring.                                                                                                                                                               |
| `checks.disk.usageThresholdPercent`      | number                                            | `90`                           | Disk usage % that counts as a breach, 0 to 100. Disk incidents open on the first breach.                                                                                                    |
| `checks.disk.volumes`                    | string[]                                          | `["/"]`                        | Mount points (`/`, `/data`) or devices (`/dev/sda1`) to watch. At least one.                                                                                                                |
| `checks.temperature.enabled`             | boolean                                           | `false`                        | Enable CPU and NVIDIA GPU temperature monitoring. No readings on macOS.                                                                                                                     |
| `checks.temperature.cpuThresholdCelsius` | number                                            | `85`                           | CPU temperature (°C) that triggers an alert.                                                                                                                                                |
| `checks.temperature.gpuThresholdCelsius` | number                                            | `85`                           | GPU temperature (°C) that triggers an alert.                                                                                                                                                |
| `checks.temperature.consecutiveBreaches` | integer                                           | `3`                            | Consecutive high readings before opening a temperature incident.                                                                                                                            |
| `checks.gpu.enabled`                     | boolean                                           | `false`                        | Enable NVIDIA GPU VRAM monitoring, through `nvidia-smi`.                                                                                                                                    |
| `checks.gpu.vramThresholdPercent`        | number                                            | `90`                           | VRAM usage % that counts as a breach, 0 to 100.                                                                                                                                             |
| `checks.gpu.consecutiveBreaches`         | integer                                           | `3`                            | Consecutive high readings before opening a GPU incident.                                                                                                                                    |
| `updates.notifyEnabled`                  | boolean                                           | `true`                         | Send an alert via your configured notifiers when a newer release is available.                                                                                                              |
| `notifiers`                              | Notifier[]                                        | **required**                   | At least one Discord or Telegram destination. See [Notifiers](notifiers.md).                                                                                                                |

## Notifiers

`notifiers` is a required array of Discord and Telegram destinations; their
fields and how to get a webhook URL or a bot token are in
[Notifiers](notifiers.md).

## Minimal `config.json`

```json
{
  "$schema": "https://raw.githubusercontent.com/orochibraru/baba/refs/heads/main/schema/config.schema.json",
  "notifiers": [
    {
      "type": "discord",
      "webhookUrl": "https://discord.com/api/webhooks/<id>/<token>"
    }
  ]
}
```

## When the file is missing

If `config.json` doesn't exist but `config.default.json` does, in the same
directory, baba copies the template to `config.json`, warns, and carries on. The
install script refreshes that template on every install. With neither file, baba
runs from the defaults and the environment variables alone, which is enough once
a notifier comes from `BABA_NOTIFIERS_*`.

## Validation

Every command that reads the config checks all of it first and lists every
problem at once:

```text
baba: invalid config:
  • checks.cpu.usageThresholdPercent: Must be between 0 and 100
  • notifiers: At least one notifier must be configured
```

## Full example with all fields

See
[`config.example.json`](https://github.com/orochibraru/baba/blob/main/config.example.json),
which the install script uses as the default template.
