# baba

Homelab monitor: one static Go binary that checks CPU, load, memory, disk,
temperature and NVIDIA GPU, and alerts on Discord or Telegram when a threshold
is breached, reminded, and recovered. Usage in [README.md](README.md), config in
[docs/config.md](docs/config.md), env vars in [docs/env.md](docs/env.md).

## Goals and non-goals

- Small: the rewrite from Bun exists because the binaries were too big. Go
  stdlib only, never add a module. No SQLite: incident history is one JSON file.
- Linux and macOS, amd64 and arm64. No Windows: metrics and services there need
  APIs the stdlib doesn't have.
- Metrics come from `/proc` and `/sys` on Linux, `top`/`sysctl`/`vm_stat`/
  `mount` on macOS, `nvidia-smi` for GPUs. Parsers are untagged so their tests
  run on either OS; only the readers are `_linux.go`/`_darwin.go`.

## Invariants

- Release asset names are `baba-<os>-<x64|arm64>[.gz]`, the Bun era's names:
  `baba update` in already installed binaries and `install.sh` download them.
- The config shape is public (users' `config.json`, `$schema` URL). A field
  change touches `internal/config`, `schema/config.schema.json`,
  `docs/config.md`, `config.example.json` and, for env vars, `docs/env.md`; unit
  tests catch schema and env doc drift.
- A failing notifier never stops the monitor; the incident records
  `succeeded: false`.

## Testing

- `mise install`, `prek install`; hooks run gofmt, `go mod tidy -diff`, go vet
  for macOS and Linux, `go test ./...`, prettier and markdownlint.
- Integration tests build the binary and run it against the real host with
  thresholds at 0, alerts going to a fake Discord.
- `mise run cover` fails under 70%: the service package (launchctl, systemctl,
  sudo) is untested glue.
- When adding a check, prove it can fail by breaking the code once.

## Conventions

- Conventional commits; the user commits and pushes. CI ships a canary per push
  to `main` and keeps a release PR open (releaser); merging it tags the stable
  release. `scripts/build.sh` builds the assets with the version in `-ldflags`.
- Prettier rewraps Markdown at 80 columns; keep its output. `CHANGELOG.md` is
  excluded.
