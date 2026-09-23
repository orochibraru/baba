# Checks

Every `intervalSeconds`, baba reads each enabled check once, one after the
other, and logs a status line:

```text
CPU: 12% | Load: 0.52 | Memory: 41% | Disk: / 63%, /data 80% | GPU: N/A
```

A reading is a breach when it's strictly above its threshold. What happens next
(consecutive breaches, reminders, recovery) is in [Incidents](incidents.md). A
check that can't read its metric logs an error and is skipped for that cycle;
the others still run.

| Check       | On by default | Linux                              | macOS                          |
| ----------- | ------------- | ---------------------------------- | ------------------------------ |
| CPU         | yes           | `/proc/stat`                       | `top`                          |
| Load        | yes           | `/proc/loadavg`                    | `sysctl vm.loadavg`            |
| Memory      | yes           | `/proc/meminfo`                    | `sysctl hw.memsize`, `vm_stat` |
| Disk        | yes           | `/proc/self/mounts`, `statfs`      | `mount`, `statfs`              |
| Temperature | no            | hwmon, thermal zones, `nvidia-smi` | GPU only, via `nvidia-smi`     |
| GPU VRAM    | no            | `nvidia-smi`                       | `nvidia-smi`                   |

## CPU

Percentage of CPU time spent busy (everything but idle and I/O wait) over a
one-second sample taken during the cycle, rounded to a whole number. On macOS,
the second of two `top` samples one second apart.

Config: `checks.cpu`; alert: `⚠️ **CPU LOAD**: Usage is at **95%**`.

## Load

The 1-minute load average: how many processes were running or waiting for CPU.
Compare it to your core count; a threshold equal to the number of cores alerts
when the machine is saturated.

Config: `checks.load`; alert:
`🚨 **LOAD CRITICAL**: Load average is at **9.12**`.

## Memory

Used memory is total minus available: page cache and buffers the kernel can
reclaim count as free, like `htop` and `free`'s "available" column. On Linux,
`MemAvailable` (or free + buffers + cached on old kernels); on macOS, free +
inactive + speculative pages.

Config: `checks.memory`; alert:
`⚠️ **MEMORY USAGE**: Usage is at **93% (14.88 GB/16.00 GB)**`.

## Disk

For every mounted filesystem whose mount point or device is in
`checks.disk.volumes`, used space is size minus the space available to regular
users. Reserved blocks (ext4 keeps 5% for root) therefore count as used, like
`df`; on macOS, APFS volumes sharing a container all report the container's free
space.

A filesystem mounted several times (bind mounts) is checked once. If nothing in
the list is mounted, the status says `Disk: no volumes found`. Each volume is
its own incident, keyed by device, and opens on the **first** breach: there is
no `consecutiveBreaches` for disks, since disk usage doesn't spike and fall
back.

Config: `checks.disk`; alert:
`⚠️ **DISK USAGE** (/dev/sda1): Usage is at **92% (430.12 GB/468.00 GB)**`.

In Docker, see [Disks in a container](docker.md#disks-in-a-container).

## Temperature

- **CPU** (Linux): the hottest `temp*_input` of the hwmon sensors named
  `coretemp`, `k10temp`, `zenpower`, `cpu_thermal`, `cpu-thermal` or
  `soc_thermal`. Without any, the hottest thermal zone whose type mentions
  `cpu`, `x86_pkg` or `soc`. Readings at or below 0 are ignored.
- **GPU**: each NVIDIA GPU's temperature from `nvidia-smi`, as its own incident.

macOS has no CPU source without private frameworks. With no reading at all, the
check adds nothing to the status line.

Config: `checks.temperature`; alert:
`🌡️ **CPU TEMP**: Temperature is at **91°C**`.

## GPU VRAM

Memory used over memory total for each NVIDIA GPU, from
`nvidia-smi --query-gpu=name,memory.used,memory.total,temperature.gpu`. Each GPU
is its own incident, keyed by name. Other vendors aren't supported; without
`nvidia-smi`, the status says `GPU: N/A`.

Config: `checks.gpu`; alert:
`⚠️ **GPU VRAM** (NVIDIA GeForce RTX 3090): Usage is at **95%**`.
