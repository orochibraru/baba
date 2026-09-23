# Architecture

baba is one Go binary built from the standard library only: no modules, no cgo,
no runtime to install. It was a Bun app until its binaries grew too big; the Go
build is about 7 MB (3 MB gzipped) per platform.

## One cycle

```text
config.json + BABA_* ──► config ──► start
                                      │ every intervalSeconds
                                      ▼
                   sysinfo readings (CPU, load, memory, disks, sensors, nvidia-smi)
                                      │
                                      ▼
                   monitor: breach counts, open / remind / resolve
                          │                               │
                          ▼                               ▼
                 incidents (JSON file)          notify (Discord, Telegram)
```

- **config** decodes `config.json` over the defaults, applies the `BABA_*`
  variables, then validates everything at once. Every command goes through it.
- **sysinfo** reads the metrics. Parsers are plain functions over text
  (`/proc/stat`, `top` output, `nvidia-smi` CSV) that compile everywhere, so
  their tests run on any OS; only the readers are per-OS files.
- **monitor** holds the breach counts and decides: open, remind, resolve. It
  gets the incident store and an alert function, so tests drive it with fakes.
- **incidents** is the history, one JSON file rewritten atomically on each
  change.
- **notify** posts to Discord and Telegram and reports every failure.

The checks run one after the other: nothing is shared between goroutines, so
there are no locks. The CPU sample makes a cycle last a little over a second.
The only other goroutine is the one-time update check at startup.

## Decisions

- **Standard library only.** Every module is size and supply chain. Metrics that
  would need cgo or private APIs on macOS come from its command-line tools
  instead (`top`, `sysctl`, `vm_stat`, `mount`).
- **JSON, not SQLite.** A pure-Go SQLite driver costs several MB, and the
  history is a few hundred small records. The file is readable with `jq`.
- **Sequential checks.** A cycle every minute doesn't need parallelism, and the
  monitor stays lock-free.
- **Release asset names.** `baba-<os>-<x64|arm64>` comes from the Bun builds:
  `baba update` in installed binaries and the install script download those
  names, so they can't change.
- **No Windows.** Its metrics and service manager need APIs the standard library
  doesn't have.

## Building and testing

```bash
make build   # dist/baba-<os>-<arch> and .gz, for Linux and macOS
make test    # unit tests, then integration tests on the real binary
make cover   # coverage across both; fails under 70%
```

Integration tests build the binary and drive it like a user: the setup wizard
with piped answers, `validate`, then `start` against the real host with every
threshold at 0, alerts landing in a fake Discord webhook, and the incident
commands afterwards. More in
[CONTRIBUTING.md](https://github.com/orochibraru/baba/blob/main/CONTRIBUTING.md).
