# Background service

`baba install` registers `/usr/local/bin/baba start` as a service that starts on
its own and restarts on crash. It needs `/var/lib/baba/config.json`, so run
`baba setup` first.

```bash
baba setup     # configure
baba install   # register and start
baba logs -f   # follow the output
```

Run `baba install` again after changing its binary or to repair the service: it
rewrites the definition and restarts it. After editing `config.json`,
`baba restart` is enough.

## macOS: launchd

A LaunchAgent at `~/Library/LaunchAgents/com.orochibraru.baba.plist`, loaded
with `launchctl load -w`. It runs as your user, starts at login (`RunAtLoad`)
and is restarted whenever it exits (`KeepAlive`). `baba restart` runs
`launchctl kickstart -k gui/<uid>/com.orochibraru.baba`.

## Linux: systemd

baba tries a system service first: it copies the unit to
`/etc/systemd/system/baba.service` with `sudo` (asking for your password if
needed), then `daemon-reload`, `enable` and `restart`. It starts at boot, runs
as root, and restarts 5 seconds after a crash.

```bash
sudo systemctl status baba
```

Without `sudo`, it falls back to a user service in
`~/.config/systemd/user/baba.service` (`systemctl --user`), which only runs
while you're logged in. To keep it running after you log out:

```bash
loginctl enable-linger "$USER"
```

## Logs

Both service managers append baba's output to `/var/lib/baba/baba.log`: one JSON
object per line, since the output isn't a terminal.

```bash
baba logs            # last 100 lines, readable
baba logs -n 500
baba logs -f         # then follow new lines, like tail -f
```

`baba logs` turns each line into
`2026-09-23 21:01:19.155 [INFO] message key=value` (times in UTC) and passes
anything else through, including the older pino lines from the TypeScript baba.
Running `baba start` in a terminal prints readable `key=value` lines instead of
JSON. Raise the detail with `logLevel: "debug"`: it logs every reading and
breach count.

The log file isn't rotated; truncate it whenever (`baba logs -f` picks up from
the start again).

## Removing it

```bash
baba uninstall           # stop and unregister, keep /var/lib/baba
baba uninstall --purge   # also delete /var/lib/baba: config, incidents, logs
```

The binary stays in `/usr/local/bin`; delete it yourself.
