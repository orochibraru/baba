# Incidents

baba doesn't alert on every high reading. It opens an **incident** once a metric
has breached its threshold enough times in a row, reminds you while it lasts,
and tells you when it's over. Every alert starts with `[machineName]`.

## Lifecycle

```text
reading above threshold ──► breach count +1 ──► count reaches consecutiveBreaches?
                                                      │ yes
                                                      ▼
                                          incident opens, alert sent
                                                      │
          still above: reminder every reminderIntervalMinutes since the last alert
                                                      │
                                          reading at or below threshold
                                                      ▼
                                          incident resolved, recovery sent
```

1. **Breach**: a reading strictly above the threshold adds one to that metric's
   breach count. A normal reading resets it, so `consecutiveBreaches: 3` with a
   60 second interval means three minutes above the line. Disks skip this and
   open on the first breach.
2. **Open**: the incident is recorded with the value and threshold, and the
   alert goes out, e.g. `[nas] ⚠️ **CPU LOAD**: Usage is at **95%**`.
3. **Reminder**: while it stays above, each cycle checks how long since the last
   notification; past `reminderIntervalMinutes`, it sends
   `⏰ **CPU REMINDER**: Still at **97%**`. The incident's peak value follows
   the highest reading.
4. **Recovery**: the first reading at or below the threshold resolves the
   incident and sends `✅ **CPU**: Back to normal at **42%**`. There is no
   breach count on the way down.

Each metric has at most one open incident: one per disk device, one per GPU, one
for CPU temperature and so on.

## Restarts

Incidents are saved on every change, so an incident open when baba stops is
still open when it comes back: no second alert, and you still get the recovery.
Breach counts live in memory and start over.

## Browsing them

```bash
baba list incidents          # newest first, 50 by default
baba list incidents -n 10
baba get incident 12         # details and every notification sent
```

```text
ID    Metric                      Volume          Started               Status    Peak      Threshold Notifs
────────────────────────────────────────────────────────────────────────────────────────────────────────────
12    disk                        /dev/sda1       2026-09-23 21:01:19   OPEN      92        90        3
11    cpu                         -               2026-09-23 18:40:02   RESOLVED  99        90        2
```

`baba get incident` marks each notification `✓` or `✗`: a `✗` means a notifier
refused it or couldn't be reached (see [Notifiers](notifiers.md)). Times are
UTC.

## Storage

The history is one JSON file, `database.path` (`/var/lib/baba/incidents.json` by
default), rewritten atomically (write to a temporary file, then rename) on every
change. It's readable and greppable:

```json
{
  "incidents": [
    {
      "id": 1,
      "metric": "disk",
      "volume": "/dev/sda1",
      "startedAt": "2026-09-23T21:01:19.155+02:00",
      "resolvedAt": "2026-09-23T22:10:04.012+02:00",
      "peakValue": 92,
      "threshold": 90,
      "notifications": [
        {
          "sentAt": "2026-09-23T21:01:19.160+02:00",
          "type": "alert",
          "succeeded": true
        },
        {
          "sentAt": "2026-09-23T22:10:04.020+02:00",
          "type": "recovery",
          "succeeded": true
        }
      ]
    }
  ]
}
```

Nothing is ever pruned; delete the file (with baba stopped) to start over.

The TypeScript versions of baba kept this history in SQLite (`baba.db`). When
`database.path` still points to one, baba renames it to `baba.db.sqlite.bak` and
starts a fresh history; the old incidents aren't carried over.
