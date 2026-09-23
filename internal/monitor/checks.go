package monitor

import (
	"fmt"
	"log/slog"
	"math"
	"slices"
	"strings"

	"github.com/orochibraru/baba/internal/config"
	"github.com/orochibraru/baba/internal/sysinfo"
)

// Run reads every enabled check once and returns the status line; a failing check is logged and skipped.
func (m *Monitor) Run(checks config.Checks) string {
	var parts []string
	run := func(enabled bool, check func(config.Checks) (string, error)) {
		if !enabled {
			return
		}
		part, err := check(checks)
		if err != nil {
			slog.Error("check failed", "error", err)
		}
		if part != "" {
			parts = append(parts, part)
		}
	}
	run(checks.CPU.Enabled, m.cpu)
	run(checks.Load.Enabled, m.load)
	run(checks.Memory.Enabled, m.memory)
	run(checks.Disk.Enabled, m.disk)
	run(checks.Temperature.Enabled, m.temperature)
	run(checks.GPU.Enabled, m.gpu)
	return strings.Join(parts, " | ")
}

func (m *Monitor) cpu(checks config.Checks) (string, error) {
	percent, err := sysinfo.CPUPercent()
	if err != nil {
		return "", fmt.Errorf("cpu: %w", err)
	}
	usage := math.Round(percent)
	return fmt.Sprintf("CPU: %g%%", usage), m.Evaluate(Reading{
		Metric: "cpu", Value: usage, Threshold: checks.CPU.UsageThresholdPercent, Consecutive: checks.CPU.ConsecutiveBreaches,
		Open:     fmt.Sprintf("⚠️ **CPU LOAD**: Usage is at **%g%%**", usage),
		Reminder: fmt.Sprintf("⏰ **CPU REMINDER**: Still at **%g%%**", usage),
		Recovery: fmt.Sprintf("✅ **CPU**: Back to normal at **%g%%**", usage),
	})
}

func (m *Monitor) load(checks config.Checks) (string, error) {
	load, err := sysinfo.Load()
	if err != nil {
		return "", fmt.Errorf("load: %w", err)
	}
	return fmt.Sprintf("Load: %.2f", load), m.Evaluate(Reading{
		Metric: "load", Value: load, Threshold: checks.Load.Threshold, Consecutive: checks.Load.ConsecutiveBreaches,
		Open:     fmt.Sprintf("🚨 **LOAD CRITICAL**: Load average is at **%.2f**", load),
		Reminder: fmt.Sprintf("⏰ **LOAD REMINDER**: Still at **%.2f**", load),
		Recovery: fmt.Sprintf("✅ **LOAD**: Back to normal at **%.2f**", load),
	})
}

func (m *Monitor) memory(checks config.Checks) (string, error) {
	used, total, err := sysinfo.Memory()
	if err != nil {
		return "", fmt.Errorf("memory: %w", err)
	}
	usage := math.Round(float64(used) / float64(total) * 100)
	return fmt.Sprintf("Memory: %g%%", usage), m.Evaluate(Reading{
		Metric: "memory", Value: usage, Threshold: checks.Memory.UsageThresholdPercent, Consecutive: checks.Memory.ConsecutiveBreaches,
		Open:     fmt.Sprintf("⚠️ **MEMORY USAGE**: Usage is at **%g%% (%s/%s)**", usage, HumanBytes(used), HumanBytes(total)),
		Reminder: fmt.Sprintf("⏰ **MEMORY REMINDER**: Still at **%g%%**", usage),
		Recovery: fmt.Sprintf("✅ **MEMORY**: Back to normal at **%g%%**", usage),
	})
}

// disk watches the mounts whose device or mount point is listed in the config; disk incidents open on the first breach.
func (m *Monitor) disk(checks config.Checks) (string, error) {
	mounts, err := sysinfo.Mounts()
	if err != nil {
		return "", fmt.Errorf("disk: %w", err)
	}
	var parts []string
	seen := map[string]bool{}
	for _, mount := range mounts {
		if seen[mount.Device] || !slices.Contains(checks.Disk.Volumes, mount.Device) && !slices.Contains(checks.Disk.Volumes, mount.Path) {
			continue
		}
		seen[mount.Device] = true
		used, total, err := sysinfo.Disk(mount.Path)
		if err != nil || total == 0 {
			slog.Warn("disk unreadable", "mount", mount.Path, "error", err)
			continue
		}
		usage := math.Round(float64(used) / float64(total) * 100)
		parts = append(parts, fmt.Sprintf("%s %g%%", mount.Path, usage))
		if err := m.Evaluate(Reading{
			Metric: "disk", Volume: mount.Device, Value: usage, Threshold: checks.Disk.UsageThresholdPercent, Consecutive: 1,
			Open:     fmt.Sprintf("⚠️ **DISK USAGE** (%s): Usage is at **%g%% (%s/%s)**", mount.Device, usage, HumanBytes(used), HumanBytes(total)),
			Reminder: fmt.Sprintf("⏰ **DISK REMINDER** (%s): Still at **%g%%**", mount.Device, usage),
			Recovery: fmt.Sprintf("✅ **DISK** (%s): Back to normal at **%g%%**", mount.Device, usage),
		}); err != nil {
			return "", err
		}
	}
	if parts == nil {
		return "Disk: no volumes found", nil
	}
	return "Disk: " + strings.Join(parts, ", "), nil
}

func (m *Monitor) temperature(checks config.Checks) (string, error) {
	t := checks.Temperature
	var parts []string
	if cpu := sysinfo.CPUTemperature(); cpu > 0 {
		parts = append(parts, fmt.Sprintf("CPU %g°C", cpu))
		if err := m.Evaluate(Reading{
			Metric: "temp:cpu", Value: cpu, Threshold: t.CPUThresholdCelsius, Consecutive: t.ConsecutiveBreaches,
			Open:     fmt.Sprintf("🌡️ **CPU TEMP**: Temperature is at **%g°C**", cpu),
			Reminder: fmt.Sprintf("⏰ **CPU TEMP REMINDER**: Still at **%g°C**", cpu),
			Recovery: fmt.Sprintf("✅ **CPU TEMP**: Back to normal at **%g°C**", cpu),
		}); err != nil {
			return "", err
		}
	}
	for _, gpu := range sysinfo.GPUs() {
		if gpu.Temperature <= 0 {
			continue
		}
		parts = append(parts, fmt.Sprintf("%s %g°C", gpu.Name, gpu.Temperature))
		if err := m.Evaluate(Reading{
			Metric: "temp:gpu:" + gpu.Name, Value: gpu.Temperature, Threshold: t.GPUThresholdCelsius, Consecutive: t.ConsecutiveBreaches,
			Open:     fmt.Sprintf("🌡️ **GPU TEMP** (%s): Temperature is at **%g°C**", gpu.Name, gpu.Temperature),
			Reminder: fmt.Sprintf("⏰ **GPU TEMP REMINDER** (%s): Still at **%g°C**", gpu.Name, gpu.Temperature),
			Recovery: fmt.Sprintf("✅ **GPU TEMP** (%s): Back to normal at **%g°C**", gpu.Name, gpu.Temperature),
		}); err != nil {
			return "", err
		}
	}
	if parts == nil {
		return "", nil // no sensors (e.g. macOS): no status
	}
	return "Temp: " + strings.Join(parts, " | "), nil
}

func (m *Monitor) gpu(checks config.Checks) (string, error) {
	var parts []string
	for _, gpu := range sysinfo.GPUs() {
		if gpu.VRAMPercent < 0 {
			continue
		}
		parts = append(parts, fmt.Sprintf("%s: %g%%", gpu.Name, gpu.VRAMPercent))
		if err := m.Evaluate(Reading{
			Metric: "gpu:" + gpu.Name, Value: gpu.VRAMPercent, Threshold: checks.GPU.VRAMThresholdPercent, Consecutive: checks.GPU.ConsecutiveBreaches,
			Open:     fmt.Sprintf("⚠️ **GPU VRAM** (%s): Usage is at **%g%%**", gpu.Name, gpu.VRAMPercent),
			Reminder: fmt.Sprintf("⏰ **GPU VRAM REMINDER** (%s): Still at **%g%%**", gpu.Name, gpu.VRAMPercent),
			Recovery: fmt.Sprintf("✅ **GPU VRAM** (%s): Back to normal at **%g%%**", gpu.Name, gpu.VRAMPercent),
		}); err != nil {
			return "", err
		}
	}
	if parts == nil {
		return "GPU: N/A", nil
	}
	return "GPU: " + strings.Join(parts, " | "), nil
}

// HumanBytes formats bytes with binary units, e.g. "1.50 GB".
func HumanBytes(bytes uint64) string {
	value, units := float64(bytes), []string{"B", "KB", "MB", "GB", "TB"}
	i := 0
	for value >= 1024 && i < len(units)-1 {
		value /= 1024
		i++
	}
	return fmt.Sprintf("%.2f %s", value, units[i])
}
