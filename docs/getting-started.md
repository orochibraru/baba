# Getting started

Install baba on a Linux or macOS server, point it at Discord or Telegram, and
leave it running.

## 1. Install

```bash
curl -fsSL https://github.com/orochibraru/baba/releases/latest/download/install.sh | sh
```

The script detects your OS (Linux or macOS) and architecture (x64 or arm64),
installs the binary to `/usr/local/bin/baba` (with `sudo` if that directory
isn't writable), creates `/var/lib/baba/`, and seeds `/var/lib/baba/config.json`
from the default template unless one already exists.

| Variable      | Default                     | Effect                                     |
| ------------- | --------------------------- | ------------------------------------------ |
| `INSTALL_DIR` | `/usr/local/bin`            | Where the binary goes                      |
| `VERSION`     | `latest`                    | A release to install instead, e.g. `2.0.0` |
| `CONFIG_PATH` | `/var/lib/baba/config.json` | Where the config is seeded                 |

```bash
curl -fsSL https://github.com/orochibraru/baba/releases/latest/download/install.sh | INSTALL_DIR=~/.local/bin sh
```

The [background service](service.md) always runs `/usr/local/bin/baba`, so keep
the default `INSTALL_DIR` if you plan to use `baba install`.

Prefer to download by hand? Every
[release](https://github.com/orochibraru/baba/releases) has
`baba-<linux|darwin>-<x64|arm64>`, and a `.gz` of each.

## 2. Configure

```bash
baba setup
```

The wizard asks for a machine name, the check interval, your notifiers and every
check's threshold, then writes `/var/lib/baba/config.json`. Run it again any
time: it starts from your current values, so pressing Enter keeps them. Every
setting is documented in [Configuration file](config.md).

## 3. Test the notifiers

```bash
baba validate
```

Sends "This is a test alert." through every notifier, and fails if one of them
doesn't accept it. See [Notifiers](notifiers.md) to get a webhook URL or a bot
token.

## 4. Run it

```bash
baba install   # background service, starts on boot (Linux) or login (macOS)
baba logs -f   # follow what it does
```

Or in the foreground, for a first look:

```bash
baba start
```

Every cycle logs one status line, e.g.
`CPU: 12% | Load: 0.52 | Memory: 41% | Disk: / 63%`. When a value stays above
its threshold, you get an alert; when it comes back, you get a recovery. The
rules are in [Incidents](incidents.md).

## 5. Check on it

```bash
baba health           # config, incident history and metrics all readable?
baba list incidents   # what happened while you weren't looking
```

All commands are in the [CLI reference](commands.md).
