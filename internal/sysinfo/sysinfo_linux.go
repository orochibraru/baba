package sysinfo

import (
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// CPUPercent samples /proc/stat one second apart.
func CPUPercent() (float64, error) {
	sample := func() (uint64, uint64, error) {
		stat, err := os.ReadFile("/proc/stat")
		if err != nil {
			return 0, 0, err
		}
		return ProcStatCPU(string(stat))
	}
	busy1, total1, err := sample()
	if err != nil {
		return 0, err
	}
	time.Sleep(time.Second)
	busy2, total2, err := sample()
	if err != nil || total2 == total1 {
		return 0, err
	}
	return float64(busy2-busy1) / float64(total2-total1) * 100, nil
}

func Load() (float64, error) {
	loadavg, err := os.ReadFile("/proc/loadavg")
	if err != nil {
		return 0, err
	}
	return FirstFloat(string(loadavg))
}

// Memory counts used as total minus available: page cache and buffers are free, like htop.
func Memory() (used, total uint64, err error) {
	meminfo, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return 0, 0, err
	}
	total, available, err := Meminfo(string(meminfo))
	return total - available, total, err
}

func Mounts() ([]Mount, error) {
	mounts, err := os.ReadFile("/proc/self/mounts")
	return ProcMounts(string(mounts)), err
}

// Disk counts used as size minus what's available to users, so reserved blocks count as used, like df.
func Disk(path string) (used, total uint64, err error) {
	var fs syscall.Statfs_t
	if err := syscall.Statfs(path, &fs); err != nil {
		return 0, 0, err
	}
	total = fs.Blocks * uint64(fs.Bsize)
	return total - fs.Bavail*uint64(fs.Bsize), total, nil
}

var cpuSensors = []string{"coretemp", "k10temp", "zenpower", "cpu_thermal", "cpu-thermal", "soc_thermal"}

// CPUTemperature is the hottest reading of a CPU hwmon sensor, else of a CPU thermal zone; -1 if none.
func CPUTemperature() float64 {
	hottest := -1.0
	read := func(file string) {
		data, err := os.ReadFile(file)
		if err != nil {
			return
		}
		if milli, err := strconv.ParseFloat(strings.TrimSpace(string(data)), 64); err == nil && milli > 0 {
			hottest = max(hottest, milli/1000)
		}
	}
	sensors, _ := filepath.Glob("/sys/class/hwmon/hwmon*")
	for _, dir := range sensors {
		if name, _ := os.ReadFile(filepath.Join(dir, "name")); slices.Contains(cpuSensors, strings.TrimSpace(string(name))) {
			inputs, _ := filepath.Glob(filepath.Join(dir, "temp*_input"))
			for _, input := range inputs {
				read(input)
			}
		}
	}
	if hottest > 0 {
		return hottest
	}
	zones, _ := filepath.Glob("/sys/class/thermal/thermal_zone*")
	for _, dir := range zones {
		kind, _ := os.ReadFile(filepath.Join(dir, "type"))
		if k := strings.ToLower(string(kind)); strings.Contains(k, "cpu") || strings.Contains(k, "x86_pkg") || strings.Contains(k, "soc") {
			read(filepath.Join(dir, "temp"))
		}
	}
	return hottest
}
