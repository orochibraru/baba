# CLI reference

```text
baba <command> [flags]
```

Flags go before or after arguments, with one or two dashes (`-config` and
`--config` are the same). Every command exits with 1 and prints `baba: <error>`
on stderr when it fails.

| Command                  | What it does                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `baba setup`             | Interactive wizard, writes `config.json` ([Getting started](getting-started.md#2-configure)) |
| `baba validate`          | Sends a test alert through every notifier; fails if any refuses it                           |
| `baba start`             | Runs the monitor in the foreground until SIGINT or SIGTERM                                   |
| `baba install`           | Registers and starts the [background service](service.md)                                    |
| `baba restart`           | Restarts the background service                                                              |
| `baba uninstall`         | Removes the background service; `--purge` also deletes `/var/lib/baba`                       |
| `baba logs`              | Prints the service log; `-f` follows it, `-n` sets the line count (100)                      |
| `baba health`            | Checks config, incident history and metrics; exits 1 if any fails                            |
| `baba list incidents`    | Lists [incidents](incidents.md), newest first; `-n` sets the limit (50)                      |
| `baba get incident <id>` | Shows one incident and its notifications                                                     |
| `baba update`            | Replaces the binary with the latest release ([Updates](updates.md))                          |
| `baba version`           | Prints the version; also `-v` and `--version`                                                |
| `baba help`              | Prints the command list, as does `baba` alone                                                |

## Flags

| Flag                       | Commands                                              | Default                                               |
| -------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| `--config <path>`          | `setup`, `validate`, `start`, `health`, `list`, `get` | `$BABA_CONFIG_PATH`, else `/var/lib/baba/config.json` |
| `-n`, `--lines`, `--limit` | `logs` (lines), `list incidents` (incidents)          | 100, 50                                               |
| `-f`, `--follow`           | `logs`                                                | off                                                   |
| `--purge`                  | `uninstall`                                           | off                                                   |

## health

```text
✓ config
✓ incidents
✓ system
```

- **config**: the config loads and validates.
- **incidents**: the history file exists and parses. It's created by the first
  `baba start`, so this fails on a fresh install.
- **system**: memory stats are readable. In Docker, a failure here usually means
  `--pid=host` is missing.

The Docker image uses it as its `HEALTHCHECK`.
