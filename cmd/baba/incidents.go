package main

import (
	"cmp"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/orochibraru/baba/internal/incidents"
)

func openStore(configPath string) (*incidents.Store, error) {
	c, err := load(configPath)
	if err != nil {
		return nil, err
	}
	return incidents.Open(c.Database.Path)
}

func status(i *incidents.Incident) string {
	if i.ResolvedAt.IsZero() {
		return "OPEN"
	}
	return "RESOLVED"
}

func date(t time.Time) string { return t.UTC().Format(time.DateTime) }

func listIncidents(w io.Writer, configPath string, limit int) error {
	store, err := openStore(configPath)
	if err != nil {
		return err
	}
	list := store.List(limit)
	if len(list) == 0 {
		fmt.Fprintln(w, "No incidents recorded.")
		return nil
	}
	widths := []int{6, 28, 16, 22, 10, 10, 10, 6}
	row := func(cells ...string) {
		var b strings.Builder
		for i, cell := range cells {
			fmt.Fprintf(&b, "%-*s", widths[i], cell[:min(len(cell), widths[i])])
		}
		fmt.Fprintln(w, strings.TrimRight(b.String(), " "))
	}
	row("ID", "Metric", "Volume", "Started", "Status", "Peak", "Threshold", "Notifs")
	fmt.Fprintln(w, strings.Repeat("─", 108))
	for _, i := range list {
		row(strconv.Itoa(i.ID), i.Metric, cmp.Or(i.Volume, "-"), date(i.StartedAt), status(i),
			strconv.FormatFloat(i.PeakValue, 'f', -1, 64), strconv.FormatFloat(i.Threshold, 'f', -1, 64), strconv.Itoa(len(i.Notifications)))
	}
	return nil
}

func getIncident(w io.Writer, configPath string, id int) error {
	store, err := openStore(configPath)
	if err != nil {
		return err
	}
	i := store.Get(id)
	if i == nil {
		return fmt.Errorf("incident #%d not found", id)
	}
	fmt.Fprintf(w, "\nIncident #%d\n  Metric:     %s\n", i.ID, i.Metric)
	if i.Volume != "" {
		fmt.Fprintf(w, "  Volume:     %s\n", i.Volume)
	}
	fmt.Fprintf(w, "  Status:     %s\n  Started:    %s\n", status(i), date(i.StartedAt))
	if !i.ResolvedAt.IsZero() {
		fmt.Fprintf(w, "  Resolved:   %s\n", date(i.ResolvedAt))
	}
	fmt.Fprintf(w, "  Peak value: %g\n  Threshold:  %g\n", i.PeakValue, i.Threshold)
	if len(i.Notifications) == 0 {
		fmt.Fprintln(w, "\n  No notifications recorded.")
	} else {
		fmt.Fprintf(w, "\n  Notifications (%d):\n", len(i.Notifications))
		for _, n := range i.Notifications {
			fmt.Fprintf(w, "    %s  %-10s %s\n", date(n.SentAt), n.Type, map[bool]string{true: "✓", false: "✗"}[n.Succeeded])
		}
	}
	fmt.Fprintln(w)
	return nil
}
