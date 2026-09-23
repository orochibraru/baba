# Contributing

## Prerequisites

- [Bun](https://bun.sh) v1.x

## Setup

```bash
bun install
cp config.example.json config.json
# Edit config.json — set at least one notifier webhook URL
```

## Running locally

```bash
bun run dev        # hot-reload dev server
bun run build      # compile self-contained binaries → ./dist
```

## Tests

```bash
bun test           # run tests with coverage
bun run lint       # lint with Biome
bun run lint:fix   # auto-fix lint issues
bun run check      # Run all type checks
```

## Other scripts

```bash
bun run gen:schema    # regenerate schema/config.schema.json
bun run gen:docs      # regenerate docs/env.md and docs/config.md
bun run gen           # Run all generators
```

## Adding a notifier

1. Create `src/lib/notifiers/<name>.ts` — export a Zod schema and a class extending `AbstractNotifier`
2. Add the schema import and union entry in `src/config.ts`
3. Add an instantiation branch in `src/lib/notifiers/index.ts`
4. Add corresponding `BABA_*` env vars in `src/lib/env.ts`

## Release process

Every merge to `main` ships a canary (`vX.Y.Z-canary.N`, a GitHub prerelease and the `:canary` image), versioned from Conventional Commits. The stable release waits in the `chore(release): X.Y.Z` PR; merging it cuts `vX.Y.Z`, which `baba update` and the install script pick up.

To contribute:

1. Fork the repository
2. Create a new branch for your changes
3. Make your changes and commit them
4. Push your changes to your fork
5. Create a pull request against the main repository
