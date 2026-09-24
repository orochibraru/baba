# Contributing

## Prerequisites

[mise](https://mise.jdx.dev) installs the pinned Go, prek, gotestsum and pinact:

```bash
mise install
prek install   # hooks on every commit: gofmt, go mod tidy, go vet (macOS and Linux), go test, Markdown, pinned Actions
cp config.example.json config.json
# Edit config.json: set at least one notifier
```

Go standard library only: don't add a module.

## Running locally

```bash
make run           # go run ./cmd/baba start --config config.json
make build         # cross-compile release binaries into ./dist (VERSION=x.y.z)
make docker        # build the image
```

## Tests

```bash
make test          # unit tests, then integration tests that build and drive the real binary
make cover         # coverage of cmd/ and internal/ across all tests; fails under 70%
make lint          # every prek hook on every file
```

Integration tests run baba against the host it runs on (thresholds at 0 so every
check alerts) and send alerts to a fake Discord webhook.

`docs/env.md` and `schema/config.schema.json` are written by hand; unit tests
fail when they drift from the `Config` struct and its env vars.

## Adding a notifier

1. Add its fields to `config.Notifier` and its validation to `Config.validate`
2. Add its request to `notify.Alert`
3. Add its `BABA_NOTIFIERS_*` env vars to `applyEnv`
4. Document it in `docs/notifiers.md`, `docs/env.md` and the schema

## Release process

Every merge to `main` ships a canary (`vX.Y.Z-canary.N`, a GitHub prerelease and
the `:canary` image), versioned from Conventional Commits. The stable release
waits in the `chore(release): X.Y.Z` PR; merging it cuts `vX.Y.Z`, which
`baba update` and the install script pick up.

To contribute:

1. Fork the repository
2. Create a new branch for your changes
3. Make your changes and commit them
4. Push your changes to your fork
5. Create a pull request against the main repository
