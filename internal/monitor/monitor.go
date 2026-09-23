// Package monitor turns readings into incidents: open after N consecutive breaches, remind while
// open, resolve on recovery, alerting each time.
package monitor

import (
	"fmt"
	"log/slog"
	"time"

	"github.com/orochibraru/baba/internal/incidents"
)

type Monitor struct {
	MachineName string
	Reminder    time.Duration
	Store       *incidents.Store
	Alert       func(message string) error
	breaches    map[string]int
}

// Reading is one metric value; Open, Reminder and Recovery are the alert messages.
type Reading struct {
	Metric, Volume           string
	Value, Threshold         float64
	Consecutive              int
	Open, Reminder, Recovery string
}

func (m *Monitor) Evaluate(r Reading) error {
	if m.breaches == nil {
		m.breaches = map[string]int{}
	}
	key := r.Metric
	if r.Volume != "" {
		key += ":" + r.Volume
	}
	active := m.Store.Active(r.Metric, r.Volume)

	switch {
	case r.Value > r.Threshold && active != nil:
		if err := m.Store.Peak(active, r.Value); err != nil {
			return err
		}
		elapsed := time.Since(active.LastNotified())
		slog.Debug("breach ongoing", "key", key, "incident", active.ID, "elapsed", elapsed.Round(time.Second).String())
		if elapsed > m.Reminder {
			return m.notify(active, "reminder", r.Reminder)
		}
	case r.Value > r.Threshold:
		m.breaches[key]++
		slog.Debug("breach", "key", key, "count", m.breaches[key], "required", r.Consecutive, "value", r.Value, "threshold", r.Threshold)
		if m.breaches[key] >= r.Consecutive {
			delete(m.breaches, key)
			incident, err := m.Store.Start(r.Metric, r.Volume, r.Value, r.Threshold)
			if err != nil {
				return err
			}
			return m.notify(incident, "alert", r.Open)
		}
	default:
		delete(m.breaches, key)
		if active == nil {
			slog.Debug("value normal", "key", key, "value", r.Value, "threshold", r.Threshold)
			return nil
		}
		slog.Debug("value back to normal, resolving", "key", key, "incident", active.ID)
		if err := m.Store.Resolve(active); err != nil {
			return err
		}
		return m.notify(active, "recovery", r.Recovery)
	}
	return nil
}

// notify records whether the alert went out; a failed notifier doesn't stop the monitor.
func (m *Monitor) notify(incident *incidents.Incident, kind, message string) error {
	err := m.Alert(fmt.Sprintf("[%s] %s", m.MachineName, message))
	return m.Store.Notify(incident, kind, err == nil)
}
