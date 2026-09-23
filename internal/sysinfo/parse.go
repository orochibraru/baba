// Package sysinfo reads host metrics from /proc and /sys on Linux, and system tools on macOS.
// Parsers live here, untagged, so their tests run on any OS.
package sysinfo

import (
	"bufio"
	"errors"
	"fmt"
	"math"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
)

type Mount struct{ Device, Path string }

type GPU struct {
	Name        string
	VRAMPercent float64 // -1 when unknown
	Temperature float64 // -1 when unknown
}

// ProcStatCPU returns busy and total jiffies from the aggregate "cpu" line of /proc/stat.
func ProcStatCPU(stat string) (busy, total uint64, err error) {
	line, _, _ := strings.Cut(stat, "\n")
	fields := strings.Fields(line)
	if len(fields) < 5 || fields[0] != "cpu" {
		return 0, 0, errors.New("no cpu line in /proc/stat")
	}
	for i, f := range fields[1:min(len(fields), 9)] { // guest time is already in user and nice
		n, err := strconv.ParseUint(f, 10, 64)
		if err != nil {
			return 0, 0, err
		}
		total += n
		if i != 3 && i != 4 { // idle, iowait
			busy += n
		}
	}
	return busy, total, nil
}

// Meminfo returns MemTotal and MemAvailable from /proc/meminfo, in bytes.
func Meminfo(meminfo string) (total, available uint64, err error) {
	values := map[string]uint64{}
	scanner := bufio.NewScanner(strings.NewReader(meminfo))
	for scanner.Scan() {
		key, rest, ok := strings.Cut(scanner.Text(), ":")
		if fields := strings.Fields(rest); ok && len(fields) > 0 {
			kib, _ := strconv.ParseUint(fields[0], 10, 64)
			values[key] = kib * 1024
		}
	}
	if values["MemTotal"] == 0 {
		return 0, 0, errors.New("no MemTotal in /proc/meminfo")
	}
	available, ok := values["MemAvailable"]
	if !ok {
		available = values["MemFree"] + values["Buffers"] + values["Cached"]
	}
	return values["MemTotal"], available, nil
}

// FirstFloat parses the first number in s: /proc/loadavg, or macOS "sysctl -n vm.loadavg" ("{ 1.23 1.45 1.67 }").
func FirstFloat(s string) (float64, error) {
	for _, f := range strings.Fields(s) {
		if n, err := strconv.ParseFloat(f, 64); err == nil {
			return n, nil
		}
	}
	return 0, fmt.Errorf("no number in %q", s)
}

// ProcMounts parses /proc/self/mounts; octal escapes (\040 for a space) are decoded.
func ProcMounts(mounts string) []Mount {
	var list []Mount
	for line := range strings.Lines(mounts) {
		if f := strings.Fields(line); len(f) >= 2 {
			list = append(list, Mount{unescape(f[0]), unescape(f[1])})
		}
	}
	return list
}

func unescape(s string) string {
	if u, err := strconv.Unquote(`"` + strings.ReplaceAll(s, `"`, `\"`) + `"`); err == nil {
		return u
	}
	return s
}

var darwinMountRe = regexp.MustCompile(`^(.+?) on (.+) \(`)

// DarwinMounts parses the output of macOS mount: "/dev/disk3s1s1 on / (apfs, sealed, local)".
func DarwinMounts(out string) []Mount {
	var list []Mount
	for line := range strings.Lines(out) {
		if m := darwinMountRe.FindStringSubmatch(line); m != nil {
			list = append(list, Mount{m[1], m[2]})
		}
	}
	return list
}

var topCPURe = regexp.MustCompile(`CPU usage: .*?([\d.]+)% idle`)

// TopCPU returns the busy percentage of the last sample in "top -l 2" output (the first is since boot).
func TopCPU(out string) (float64, error) {
	matches := topCPURe.FindAllStringSubmatch(out, -1)
	if matches == nil {
		return 0, errors.New("no CPU usage line in top output")
	}
	idle, err := strconv.ParseFloat(matches[len(matches)-1][1], 64)
	return 100 - idle, err
}

var vmStatPageRe = regexp.MustCompile(`page size of (\d+) bytes`)

// VMStatAvailable returns free + inactive + speculative memory, in bytes, from macOS vm_stat.
func VMStatAvailable(out string) (uint64, error) {
	m := vmStatPageRe.FindStringSubmatch(out)
	if m == nil {
		return 0, errors.New("no page size in vm_stat output")
	}
	pageSize, _ := strconv.ParseUint(m[1], 10, 64)
	var pages uint64
	for line := range strings.Lines(out) {
		key, value, _ := strings.Cut(line, ":")
		switch key {
		case "Pages free", "Pages inactive", "Pages speculative":
			n, _ := strconv.ParseUint(strings.Trim(value, " .\n"), 10, 64)
			pages += n
		}
	}
	return pages * pageSize, nil
}

// NvidiaSMI parses "nvidia-smi --query-gpu=name,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits".
func NvidiaSMI(out string) []GPU {
	var gpus []GPU
	for line := range strings.Lines(out) {
		f := strings.Split(strings.TrimSpace(line), ",")
		if len(f) < 4 {
			continue
		}
		n := len(f)
		number := func(s string) float64 {
			v, err := strconv.ParseFloat(strings.TrimSpace(s), 64)
			if err != nil {
				return -1
			}
			return v
		}
		gpu := GPU{Name: strings.TrimSpace(strings.Join(f[:n-3], ",")), VRAMPercent: -1, Temperature: number(f[n-1])}
		if used, total := number(f[n-3]), number(f[n-2]); used >= 0 && total > 0 {
			gpu.VRAMPercent = math.Round(used / total * 100)
		}
		gpus = append(gpus, gpu)
	}
	return gpus
}

// GPUs asks nvidia-smi, the only source of VRAM and GPU temperature; none without it.
func GPUs() []GPU {
	out, err := exec.Command("nvidia-smi", "--query-gpu=name,memory.used,memory.total,temperature.gpu", "--format=csv,noheader,nounits").Output()
	if err != nil {
		return nil
	}
	return NvidiaSMI(string(out))
}
