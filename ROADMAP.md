# Roadmap

Ideas for future work. Nothing here is scheduled or promised — it's a living list to track what's worth building next.

---

## Notifiers

| Notifier | Notes |
|----------|-------|
| **Ntfy** | Self-hosted push notifications. Very popular in homelabs. |
| **Slack** | Incoming webhook — almost identical to Discord to implement. |
| **Pushover** | Mobile push with priority levels and quiet hours. |
| **Gotify** | Self-hosted alternative to Ntfy. |
| **Generic webhook** | POST a configurable JSON payload to any URL. Covers every integration not listed here without needing a dedicated notifier. |
| **Email (SMTP)** | Last-resort / on-call escalation. |

---

## Checks

### Infrastructure

| Check | Notes |
|-------|-------|
| **Swap usage** | Often the first sign of impending OOM. |
| **Network I/O** | Alert on sustained bandwidth saturation on a named interface. |
| **Ping / reachability** | Is a host (router, NAS, upstream gateway) responding? |

### Services

| Check | Notes |
|-------|-------|
| **HTTP endpoint** | GET/HEAD a URL, alert if status ≠ 200 or response time exceeds a threshold w/ OpenAPI support. |
| **TCP port** | Is a port open and accepting connections? |
| **Process** | Is a named process (e.g. `nginx`, `postgres`) running? |
| **Docker container** | Is a container running and healthy (via Docker socket)? |

### Storage

| Check | Notes |
|-------|-------|
| **SMART disk health** | Alert on pre-failure indicators (`reallocated sectors`, `pending sectors`, overall health status). |
| **ZFS pool** | Alert when a pool is degraded or faulted. |
| **SSL certificate expiry** | Warn N days before a certificate expires (configurable threshold). |

---

## Platform

| Feature | Notes |
|---------|-------|
| **Prometheus `/metrics` endpoint** | Expose current check values as gauges so Grafana/Alertmanager can scrape them. |
| **Maintenance windows** | Silence all alerts during a scheduled time range. Configurable by cron expression or start/end time. |
| **Alert routing** | Send different check types to different notifiers (e.g. disk alerts → PagerDuty, CPU → Telegram). |
| **Config hot-reload** | Pick up `config.json` changes without restarting the process. |
| **Web dashboard** | Read-only incident view in a browser. No auth — designed for internal network use only. |

---

## Docs

| Feature | Notes |
|---------|-------|
| **Docs website** | A static website generated from Markdown files. |
| **Background service** | Explain how to run as a background service on different machines.  |
