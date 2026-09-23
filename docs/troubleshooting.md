# Troubleshooting

Start with `baba health`: it names the part that's broken. `logLevel: "debug"`
(or `BABA_LOG_LEVEL=debug`) logs every reading, breach count and incident
decision.

## Config

### no config file found at "…", run 'baba setup' to create one

There's no `config.json` at the path baba reads (`--config`, else
`$BABA_CONFIG_PATH`, else `/var/lib/baba/config.json`), no `config.default.json`
next to it, and the environment doesn't provide a notifier. Run `baba setup`, or
pass `--config` with the right path.

A downloaded binary run as `./baba start` still looks in `/var/lib/baba`, not in
the current directory: use `./baba start --config config.json`.

### invalid config

The message lists every problem with its key:

```text
baba: invalid config:
  • checks.cpu.usageThresholdPercent: Must be between 0 and 100
```

Fix them in `config.json`, or rerun `baba setup`. A JSON syntax or type error (a
string where a number goes) is reported by the JSON parser instead. Unknown keys
are ignored, so a misspelled key keeps its default rather than failing: compare
with [Configuration file](config.md).

### invalid value for BABA_…

An environment variable meant as a number doesn't parse. The
`*_CONSECUTIVE_BREACHES` ones must be whole numbers.

## Alerts

### Nothing arrives

1. `baba validate`: if it fails, the error names the notifier and the HTTP
   status or network error.
2. Discord `HTTP 401` or `404`: the webhook was deleted or the URL is truncated.
   Create a new one.
3. Telegram `HTTP 400` with `chat not found`: wrong `chatId`, or the bot isn't
   in that chat. `HTTP 401`: wrong `botToken`.
4. Still nothing on a real breach: with `logLevel: "debug"`, look for `breach`
   lines. The alert only fires after `consecutiveBreaches` breaches in a row,
   and a reading equal to the threshold isn't a breach.

See [Incidents](incidents.md) for the rules.

### Telegram shows `**` around values

Telegram messages are plain text; the stars are Discord's bold.

### An alert failed and never came back

There's no retry. The incident records the notification with `✗`
(`baba get incident <id>`), and the next reminder, after
`reminderIntervalMinutes`, is the next attempt.

## Checks

### Disk: no volumes found

None of `checks.disk.volumes` matches a mount point or device exactly as the
mount table lists it. Check with `findmnt` (Linux) or `mount` (macOS). In
Docker, the container only sees its own mounts: see
[Disks in a container](docker.md#disks-in-a-container).

### No temperature in the status line

No sensor was found. On Linux, check `ls /sys/class/hwmon/*/name` shows one of
the CPU sensors listed in [Checks](checks.md#temperature), and that `/sys` is
mounted in Docker. On macOS there's no CPU source; only NVIDIA GPUs report.

### GPU: N/A

`nvidia-smi` isn't in the `PATH`, fails, or reports no memory figures. Run
`nvidia-smi` yourself. Non-NVIDIA GPUs aren't supported.

### ✗ system: cannot read memory (…), is --pid=host set?

`/proc/meminfo` (Linux) or `sysctl`/`vm_stat` (macOS) couldn't be read. In
Docker, run with `--pid=host` and `--privileged`.

## Service

### ✗ incidents: not found at "…", has the service started at least once?

The history file is created by the first `baba start`. On a fresh install, start
the service; if it's running, check `database.path` points where the service
writes.

### No sudo access, installing as a user service instead

`sudo cp` to `/etc/systemd/system` failed, so the unit went to
`~/.config/systemd/user`. User services stop when you log out; run
`loginctl enable-linger "$USER"`, or rerun `baba install` from an account with
`sudo`.

### no log file at /var/lib/baba/baba.log

Only the background service writes that file. In the foreground, logs go to the
terminal; in Docker, use `docker logs`.

### moving the old SQLite incident database aside

The TypeScript baba's `baba.db` was found at `database.path`. It's renamed to
`baba.db.sqlite.bak` and the history starts fresh; see
[Incidents](incidents.md#storage).

## Updates

### could not reach GitHub releases

No network, or GitHub's API rate limit (60 requests an hour per IP without a
token). Try again later, or download the release by hand.

### download failed: HTTP 404

The latest release has no binary for this OS and architecture. Only Linux and
macOS on x64 and arm64 are built.
