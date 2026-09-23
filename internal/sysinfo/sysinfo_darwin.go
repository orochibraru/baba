package sysinfo

import (
	"os/exec"
	"strconv"
	"strings"
	"syscall"
)

func command(name string, args ...string) (string, error) {
	out, err := exec.Command(name, args...).Output()
	return string(out), err
}

// CPUPercent takes the second of two top samples one second apart.
func CPUPercent() (float64, error) {
	out, err := command("top", "-l", "2", "-n", "0", "-s", "1")
	if err != nil {
		return 0, err
	}
	return TopCPU(out)
}

func Load() (float64, error) {
	out, err := command("sysctl", "-n", "vm.loadavg")
	if err != nil {
		return 0, err
	}
	return FirstFloat(out)
}

func Memory() (used, total uint64, err error) {
	out, err := command("sysctl", "-n", "hw.memsize")
	if err != nil {
		return 0, 0, err
	}
	if total, err = strconv.ParseUint(strings.TrimSpace(out), 10, 64); err != nil {
		return 0, 0, err
	}
	if out, err = command("vm_stat"); err != nil {
		return 0, 0, err
	}
	available, err := VMStatAvailable(out)
	return total - min(available, total), total, err
}

func Mounts() ([]Mount, error) {
	out, err := command("mount")
	return DarwinMounts(out), err
}

// Disk counts used as size minus available: APFS volumes share their container's free space.
func Disk(path string) (used, total uint64, err error) {
	var fs syscall.Statfs_t
	if err := syscall.Statfs(path, &fs); err != nil {
		return 0, 0, err
	}
	total = fs.Blocks * uint64(fs.Bsize)
	return total - fs.Bavail*uint64(fs.Bsize), total, nil
}

// CPUTemperature has no source on macOS without private frameworks.
func CPUTemperature() float64 { return -1 }
