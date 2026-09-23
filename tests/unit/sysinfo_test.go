package unit

import (
	"reflect"
	"testing"

	"github.com/orochibraru/baba/internal/sysinfo"
)

func TestProcStatCPU(t *testing.T) {
	busy, total, err := sysinfo.ProcStatCPU("cpu  100 10 50 800 40 5 5 0 30 0\ncpu0 1 2 3 4\n")
	if err != nil || busy != 170 || total != 1010 {
		t.Errorf("busy, total = %d, %d, %v", busy, total, err)
	}
	if _, _, err := sysinfo.ProcStatCPU("intr 1 2 3"); err == nil {
		t.Error("no error without a cpu line")
	}
}

func TestMeminfo(t *testing.T) {
	total, available, err := sysinfo.Meminfo("MemTotal:       16000 kB\nMemFree:         1000 kB\nMemAvailable:    6000 kB\n")
	if err != nil || total != 16000*1024 || available != 6000*1024 {
		t.Errorf("%d %d %v", total, available, err)
	}
	_, available, _ = sysinfo.Meminfo("MemTotal: 100 kB\nMemFree: 10 kB\nBuffers: 5 kB\nCached: 20 kB\n")
	if available != 35*1024 {
		t.Errorf("fallback available = %d", available)
	}
	if _, _, err := sysinfo.Meminfo(""); err == nil {
		t.Error("no error without MemTotal")
	}
}

func TestFirstFloat(t *testing.T) {
	for in, want := range map[string]float64{"0.52 0.58 0.59 1/467 12345\n": 0.52, "{ 2.03 2.18 2.27 }\n": 2.03} {
		if got, err := sysinfo.FirstFloat(in); err != nil || got != want {
			t.Errorf("FirstFloat(%q) = %g, %v", in, got, err)
		}
	}
	if _, err := sysinfo.FirstFloat("{ }"); err == nil {
		t.Error("no error")
	}
}

func TestMounts(t *testing.T) {
	got := sysinfo.ProcMounts("/dev/sda1 / ext4 rw 0 0\n/dev/sdb1 /mnt/my\\040disk ext4 rw 0 0\n")
	want := []sysinfo.Mount{{Device: "/dev/sda1", Path: "/"}, {Device: "/dev/sdb1", Path: "/mnt/my disk"}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("ProcMounts = %+v", got)
	}
	got = sysinfo.DarwinMounts("/dev/disk3s1s1 on / (apfs, sealed, local, read-only, journaled)\nmap auto_home on /System/Volumes/Data/home (autofs, automounted, nobrowse)\n")
	want = []sysinfo.Mount{{Device: "/dev/disk3s1s1", Path: "/"}, {Device: "map auto_home", Path: "/System/Volumes/Data/home"}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("DarwinMounts = %+v", got)
	}
}

func TestTopCPU(t *testing.T) {
	out := "CPU usage: 10.0% user, 5.0% sys, 85.0% idle\n...\nCPU usage: 20.50% user, 9.50% sys, 70.0% idle\n"
	if got, err := sysinfo.TopCPU(out); err != nil || got != 30 {
		t.Errorf("TopCPU = %g, %v", got, err)
	}
	if _, err := sysinfo.TopCPU("nothing"); err == nil {
		t.Error("no error")
	}
}

func TestVMStatAvailable(t *testing.T) {
	out := "Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free:                               100.\nPages active:                            999.\nPages inactive:                           50.\nPages speculative:                        10.\n"
	if got, err := sysinfo.VMStatAvailable(out); err != nil || got != 160*16384 {
		t.Errorf("VMStatAvailable = %d, %v", got, err)
	}
	if _, err := sysinfo.VMStatAvailable("Pages free: 1."); err == nil {
		t.Error("no error without a page size")
	}
}

func TestNvidiaSMI(t *testing.T) {
	got := sysinfo.NvidiaSMI("NVIDIA GeForce RTX 3090, 12288, 24576, 65\nTesla, T4, [N/A], [N/A], 40\nbroken\n")
	want := []sysinfo.GPU{{Name: "NVIDIA GeForce RTX 3090", VRAMPercent: 50, Temperature: 65}, {Name: "Tesla, T4", VRAMPercent: -1, Temperature: 40}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("NvidiaSMI = %+v", got)
	}
}
