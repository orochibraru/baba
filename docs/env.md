# Environment Variables

Every setting in `config.json` can be overridden with an environment variable.
Values are applied **before** Zod validation, so type coercion and defaults still apply.

| Variable | Type | Default | Example | Description |
|----------|------|---------|---------|-------------|
| `BABA_LOG_LEVEL` | string | `info` | `debug` | Log verbosity. One of: `trace`, `debug`, `info`, `warn`, `error`. |
| `BABA_MACHINE_NAME` | string | `(system hostname)` | `nas-01` | Display name for this machine, prepended to every alert message. |
| `BABA_INTERVAL_SECONDS` | number | `60` | `30` | Seconds between monitor check cycles. |
| `BABA_REMINDER_INTERVAL_MINUTES` | number | `30` | `60` | Minutes before re-alerting for an ongoing incident. |
| `BABA_DATABASE_PATH` | string | `./tmp/baba.db` | `/data/baba.db` | Path to the SQLite incident database. |
| `BABA_NOTIFIERS` | json | — | `[{"type":"discord","webhookUrl":"https://discord.com/api/webhooks/…"}]` | Full notifiers config as a JSON array. Overrides the `notifiers` key in config.json. |
| `BABA_CPU_ENABLED` | boolean | `true` | — | Enable CPU usage monitoring. |
| `BABA_CPU_THRESHOLD` | number | `90` | `80` | CPU usage % that triggers an alert. |
| `BABA_CPU_CONSECUTIVE_BREACHES` | number | `3` | — | Consecutive high readings before opening a CPU incident. |
| `BABA_LOAD_ENABLED` | boolean | `true` | — | Enable system load-average monitoring. |
| `BABA_LOAD_THRESHOLD` | number | `8` | `4` | 1-minute load average that triggers an alert. Rule of thumb: number of CPU cores. |
| `BABA_LOAD_CONSECUTIVE_BREACHES` | number | `3` | — | Consecutive high readings before opening a load incident. |
| `BABA_MEMORY_ENABLED` | boolean | `true` | — | Enable memory usage monitoring. |
| `BABA_MEMORY_THRESHOLD` | number | `90` | `85` | Memory usage % that triggers an alert. |
| `BABA_MEMORY_CONSECUTIVE_BREACHES` | number | `3` | — | Consecutive high readings before opening a memory incident. |
| `BABA_DISK_ENABLED` | boolean | `true` | — | Enable disk usage monitoring. |
| `BABA_DISK_THRESHOLD` | number | `90` | `85` | Disk usage % that triggers an alert. |
| `BABA_DISK_VOLUMES` | csv | `/` | `/,/data` | Comma-separated mount points to monitor. |
| `BABA_TEMP_ENABLED` | boolean | `false` | — | Enable temperature monitoring (CPU + all GPUs). Off by default; most values are null on macOS. |
| `BABA_TEMP_CPU_THRESHOLD` | number | `85` | `80` | CPU temperature (°C) that triggers an alert. |
| `BABA_TEMP_GPU_THRESHOLD` | number | `85` | `80` | GPU temperature (°C) that triggers an alert. |
| `BABA_TEMP_CONSECUTIVE_BREACHES` | number | `3` | — | Consecutive high readings before opening a temperature incident. |
| `BABA_GPU_ENABLED` | boolean | `false` | — | Enable GPU utilization monitoring. Off by default; metrics unavailable on macOS. |
| `BABA_GPU_THRESHOLD` | number | `90` | `85` | GPU utilization % that triggers an alert. |
| `BABA_GPU_CONSECUTIVE_BREACHES` | number | `3` | — | Consecutive high readings before opening a GPU incident. |

## Types

| Type | Parsing |
|------|---------|
| `string` | Passed through as-is |
| `number` | Parsed with `Number()` |
| `boolean` | `"true"` or `"1"` → `true`; anything else → `false` |
| `csv` | Split on `,`, trimmed, empty strings removed |
| `json` | Parsed with `JSON.parse()` — must be valid JSON |
