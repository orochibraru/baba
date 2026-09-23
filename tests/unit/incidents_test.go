package unit

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/orochibraru/baba/internal/incidents"
)

func TestStorePersists(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "incidents.json")
	s, err := incidents.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	cpu, _ := s.Start("cpu", "", 95, 90)
	disk, _ := s.Start("disk", "/dev/sda1", 91, 90)
	if err := s.Notify(cpu, "alert", true); err != nil {
		t.Fatal(err)
	}
	if err := s.Peak(cpu, 99); err != nil {
		t.Fatal(err)
	}
	if err := s.Resolve(disk); err != nil {
		t.Fatal(err)
	}

	s, err = incidents.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if got := s.Active("cpu", ""); got == nil || got.ID != 1 || got.PeakValue != 99 || len(got.Notifications) != 1 || !got.Notifications[0].Succeeded {
		t.Errorf("active cpu = %+v", got)
	}
	if s.Active("disk", "/dev/sda1") != nil {
		t.Error("resolved disk incident still active")
	}
	if s.Active("cpu", "/dev/sda1") != nil {
		t.Error("volume ignored")
	}
	if list := s.List(10); len(list) != 2 || list[0].ID != 2 {
		t.Errorf("list = %+v", list)
	}
	if list := s.List(1); len(list) != 1 {
		t.Errorf("limit ignored: %d", len(list))
	}
	if s.Get(2) == nil || s.Get(3) != nil {
		t.Error("Get")
	}
	if next, _ := s.Start("load", "", 9, 8); next.ID != 3 {
		t.Errorf("next id = %d", next.ID)
	}
}

func TestPeakOnlyRises(t *testing.T) {
	s, _ := incidents.Open(filepath.Join(t.TempDir(), "incidents.json"))
	i, _ := s.Start("cpu", "", 95, 90)
	_ = s.Peak(i, 92)
	if i.PeakValue != 95 {
		t.Errorf("peak = %g", i.PeakValue)
	}
}

func TestLastNotified(t *testing.T) {
	s, _ := incidents.Open(filepath.Join(t.TempDir(), "incidents.json"))
	i, _ := s.Start("cpu", "", 95, 90)
	if !i.LastNotified().Equal(i.StartedAt) {
		t.Error("without notifications, LastNotified is StartedAt")
	}
	_ = s.Notify(i, "alert", false)
	if !i.LastNotified().Equal(i.Notifications[0].SentAt) {
		t.Error("LastNotified is the last notification")
	}
}

func TestOpenMovesSQLiteAside(t *testing.T) {
	path := filepath.Join(t.TempDir(), "baba.db")
	if err := os.WriteFile(path, []byte("SQLite format 3\x00rest"), 0o644); err != nil {
		t.Fatal(err)
	}
	s, err := incidents.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(s.List(10)) != 0 {
		t.Error("history not fresh")
	}
	if _, err := os.Stat(path + ".sqlite.bak"); err != nil {
		t.Error("SQLite database not kept as a backup")
	}
}

func TestOpenRejectsGarbage(t *testing.T) {
	path := filepath.Join(t.TempDir(), "incidents.json")
	_ = os.WriteFile(path, []byte("nope"), 0o644)
	if _, err := incidents.Open(path); err == nil {
		t.Error("no error")
	}
}
