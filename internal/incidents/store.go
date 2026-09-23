// Package incidents keeps the incident history in one JSON file, rewritten atomically on every change.
package incidents

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"slices"
	"time"
)

type Incident struct {
	ID            int            `json:"id"`
	Metric        string         `json:"metric"`
	Volume        string         `json:"volume,omitempty"`
	StartedAt     time.Time      `json:"startedAt"`
	ResolvedAt    time.Time      `json:"resolvedAt,omitzero"`
	PeakValue     float64        `json:"peakValue"`
	Threshold     float64        `json:"threshold"`
	Notifications []Notification `json:"notifications"`
}

type Notification struct {
	SentAt    time.Time `json:"sentAt"`
	Type      string    `json:"type"` // alert, reminder or recovery
	Succeeded bool      `json:"succeeded"`
}

// Store is not safe for concurrent use; the monitor runs its checks one after the other.
type Store struct {
	path      string
	Incidents []*Incident `json:"incidents"`
}

// Open reads the store at path, creating it (and its directory) when missing.
// A SQLite database left there by the TypeScript baba is moved aside to <path>.sqlite.bak.
func Open(path string) (*Store, error) {
	s := &Store{path: path}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return nil, err
		}
		return s, s.save()
	}
	if err != nil {
		return nil, err
	}
	if bytes.HasPrefix(data, []byte("SQLite format 3\x00")) {
		slog.Warn("moving the old SQLite incident database aside, history starts fresh", "path", path+".sqlite.bak")
		if err := os.Rename(path, path+".sqlite.bak"); err != nil {
			return nil, err
		}
		return s, s.save()
	}
	if err := json.Unmarshal(data, s); err != nil {
		return nil, fmt.Errorf("incident store %s: %w", path, err)
	}
	return s, nil
}

func (s *Store) save() error {
	data, err := json.MarshalIndent(s, "", "\t")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

// Active returns the unresolved incident for metric and volume, nil if none.
func (s *Store) Active(metric, volume string) *Incident {
	for _, i := range s.Incidents {
		if i.Metric == metric && i.Volume == volume && i.ResolvedAt.IsZero() {
			return i
		}
	}
	return nil
}

func (s *Store) Start(metric, volume string, value, threshold float64) (*Incident, error) {
	id := 1
	if n := len(s.Incidents); n > 0 {
		id = s.Incidents[n-1].ID + 1
	}
	i := &Incident{ID: id, Metric: metric, Volume: volume, StartedAt: time.Now(), PeakValue: value, Threshold: threshold, Notifications: []Notification{}}
	s.Incidents = append(s.Incidents, i)
	return i, s.save()
}

// Peak raises the incident's peak value when value exceeds it.
func (s *Store) Peak(i *Incident, value float64) error {
	if value <= i.PeakValue {
		return nil
	}
	i.PeakValue = value
	return s.save()
}

func (s *Store) Resolve(i *Incident) error {
	i.ResolvedAt = time.Now()
	return s.save()
}

func (s *Store) Notify(i *Incident, kind string, succeeded bool) error {
	i.Notifications = append(i.Notifications, Notification{SentAt: time.Now(), Type: kind, Succeeded: succeeded})
	return s.save()
}

// LastNotified is when the incident last alerted, or when it started if it never did.
func (i *Incident) LastNotified() time.Time {
	if n := len(i.Notifications); n > 0 {
		return i.Notifications[n-1].SentAt
	}
	return i.StartedAt
}

// List returns up to limit incidents, newest first.
func (s *Store) List(limit int) []*Incident {
	list := slices.Clone(s.Incidents)
	slices.Reverse(list)
	return list[:min(max(limit, 0), len(list))]
}

func (s *Store) Get(id int) *Incident {
	for _, i := range s.Incidents {
		if i.ID == id {
			return i
		}
	}
	return nil
}
