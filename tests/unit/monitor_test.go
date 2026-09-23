package unit

import (
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/orochibraru/baba/internal/incidents"
	"github.com/orochibraru/baba/internal/monitor"
)

type recorder struct {
	messages []string
	fail     bool
}

func (r *recorder) alert(message string) error {
	r.messages = append(r.messages, message)
	if r.fail {
		return errors.New("down")
	}
	return nil
}

func newMonitor(t *testing.T, reminder time.Duration) (*monitor.Monitor, *recorder) {
	t.Helper()
	store, err := incidents.Open(filepath.Join(t.TempDir(), "incidents.json"))
	if err != nil {
		t.Fatal(err)
	}
	r := &recorder{}
	return &monitor.Monitor{MachineName: "nas", Reminder: reminder, Store: store, Alert: r.alert}, r
}

func reading(value float64) monitor.Reading {
	return monitor.Reading{Metric: "cpu", Value: value, Threshold: 90, Consecutive: 3, Open: "open", Reminder: "reminder", Recovery: "recovery"}
}

func TestIncidentLifecycle(t *testing.T) {
	m, r := newMonitor(t, time.Hour)
	for _, v := range []float64{95, 95, 50, 95, 95} { // a normal reading resets the count
		if err := m.Evaluate(reading(v)); err != nil {
			t.Fatal(err)
		}
	}
	if len(r.messages) != 0 {
		t.Fatalf("alerted before 3 consecutive breaches: %v", r.messages)
	}
	_ = m.Evaluate(reading(97))
	_ = m.Evaluate(reading(99)) // ongoing, no reminder within the hour
	_ = m.Evaluate(reading(40))
	_ = m.Evaluate(reading(40))
	if got := strings.Join(r.messages, ","); got != "[nas] open,[nas] recovery" {
		t.Errorf("messages = %q", got)
	}
	i := m.Store.Get(1)
	if i == nil || i.ResolvedAt.IsZero() || i.PeakValue != 99 || len(i.Notifications) != 2 || i.Notifications[1].Type != "recovery" {
		t.Errorf("incident = %+v", i)
	}
}

func TestReminder(t *testing.T) {
	m, r := newMonitor(t, 0)
	one := reading(95)
	one.Consecutive = 1
	_ = m.Evaluate(one)
	time.Sleep(time.Millisecond)
	_ = m.Evaluate(one)
	if got := strings.Join(r.messages, ","); got != "[nas] open,[nas] reminder" {
		t.Errorf("messages = %q", got)
	}
}

func TestFailedAlertIsRecorded(t *testing.T) {
	m, r := newMonitor(t, time.Hour)
	r.fail = true
	one := reading(95)
	one.Consecutive = 1
	if err := m.Evaluate(one); err != nil {
		t.Fatal(err)
	}
	if n := m.Store.Get(1).Notifications; len(n) != 1 || n[0].Succeeded {
		t.Errorf("notifications = %+v", n)
	}
}

func TestVolumesAreSeparateIncidents(t *testing.T) {
	m, _ := newMonitor(t, time.Hour)
	for _, volume := range []string{"/dev/sda1", "/dev/sdb1"} {
		r := reading(95)
		r.Metric, r.Volume, r.Consecutive = "disk", volume, 1
		_ = m.Evaluate(r)
	}
	if len(m.Store.List(10)) != 2 {
		t.Errorf("incidents = %d", len(m.Store.List(10)))
	}
}

func TestHumanBytes(t *testing.T) {
	for bytes, want := range map[uint64]string{0: "0.00 B", 1536: "1.50 KB", 5 << 30: "5.00 GB", 3 << 50: "3072.00 TB"} {
		if got := monitor.HumanBytes(bytes); got != want {
			t.Errorf("HumanBytes(%d) = %q, want %q", bytes, got, want)
		}
	}
}
