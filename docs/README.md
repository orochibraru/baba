# Documentation

The guides in this folder, in reading order:

1. [Getting started](getting-started.md): install baba, configure it, get your
   first alert.
2. [Docker](docker.md): run it in a container instead.
3. [Configuration file](config.md): every key in `config.json` and its default.
4. [Environment variables](env.md): the `BABA_*` overrides.
5. [Checks](checks.md): what each check measures, and how, on Linux and macOS.
6. [Notifiers](notifiers.md): Discord and Telegram.
7. [Background service](service.md): launchd and systemd, logs.
8. [Incidents](incidents.md): when baba alerts, reminds and recovers.
9. [CLI reference](commands.md): every command and flag.
10. [Updates](updates.md): `baba update` and new-version alerts.
11. [Troubleshooting](troubleshooting.md): fixes for the errors you're likely to
    hit.
12. [Architecture](architecture.md): how the code fits together.

This file is the index when someone reads the repo on GitHub; the docs site
ignores it. The site's categories, order, titles and icons come from
[`config.json`](config.json).
