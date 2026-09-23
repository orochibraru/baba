package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/orochibraru/baba/internal/config"
	"github.com/orochibraru/baba/internal/incidents"
	"github.com/orochibraru/baba/internal/monitor"
	"github.com/orochibraru/baba/internal/notify"
	"github.com/orochibraru/baba/internal/sysinfo"
	"github.com/orochibraru/baba/internal/update"
)

func start(configPath string) error {
	c, err := load(configPath)
	if err != nil {
		return err
	}
	store, err := incidents.Open(c.Database.Path)
	if err != nil {
		return err
	}
	alert := func(message string) error { return notify.Alert(c.Notifiers, message) }
	m := &monitor.Monitor{MachineName: c.MachineName, Reminder: minutes(c.ReminderIntervalMinutes), Store: store, Alert: alert}

	if c.Updates.NotifyEnabled {
		go notifyUpdate(c, alert)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	slog.Info("starting up")
	slog.Info(m.Run(c.Checks))
	interval := time.Duration(c.IntervalSeconds * float64(time.Second))
	slog.Info(fmt.Sprintf("service is running, checking every %g seconds", c.IntervalSeconds))
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			slog.Info("shutting down")
			return nil
		case <-ticker.C:
			slog.Info(m.Run(c.Checks))
		}
	}
}

func minutes(m float64) time.Duration { return time.Duration(m * float64(time.Minute)) }

// markerPath is left by 'baba update' so the restarted service doesn't announce the version it just installed.
func markerPath(c *config.Config) string {
	return filepath.Join(filepath.Dir(c.Database.Path), ".just_updated")
}

func notifyUpdate(c *config.Config, alert func(string) error) {
	if info, err := os.Stat(markerPath(c)); err == nil {
		os.Remove(markerPath(c))
		if time.Since(info.ModTime()) < 5*time.Minute {
			return
		}
	}
	latest, err := update.Latest()
	if err != nil {
		slog.Warn("update check failed", "error", err)
		return
	}
	if update.IsNewer(latest, version) {
		_ = alert(fmt.Sprintf("baba v%s is available (you're on v%s). Run `baba update` to upgrade.", latest, version))
	}
}

func selfUpdate() error {
	fmt.Printf("Current version: v%s\nChecking for updates...\n", version)
	latest, err := update.Latest()
	if err != nil {
		return fmt.Errorf("could not reach GitHub releases: %w", err)
	}
	if !update.IsNewer(latest, version) {
		fmt.Printf("Already up to date (v%s).\n", version)
		return nil
	}
	fmt.Printf("New version available: v%s\nDownloading...\n", latest)
	self, err := os.Executable()
	if err != nil {
		return err
	}
	if self, err = filepath.EvalSymlinks(self); err != nil {
		return err
	}
	if err := update.Apply(latest, self); err != nil {
		return err
	}
	if c, err := config.Load(config.DefaultPath()); err == nil {
		_ = os.WriteFile(markerPath(c), nil, 0o644)
	}
	fmt.Printf("Updated to v%s. Run 'baba restart' to apply.\n", latest)
	return nil
}

// health prints one ✓ or ✗ line per check and reports whether all passed.
func health(configPath string) bool {
	logLevel.Set(slog.LevelError)
	ok := true
	report := func(name string, err error) {
		if err != nil {
			ok = false
			fmt.Fprintf(os.Stderr, "✗ %s: %v\n", name, err)
			return
		}
		fmt.Printf("✓ %s\n", name)
	}

	storePath := config.Defaults().Database.Path
	c, err := config.Load(configPath)
	if err == nil {
		storePath = c.Database.Path
	}
	report("config", err)

	if _, err = os.Stat(storePath); err != nil {
		err = fmt.Errorf("not found at %q, has the service started at least once?", storePath)
	} else {
		_, err = incidents.Open(storePath)
	}
	report("incidents", err)

	if _, total, err := sysinfo.Memory(); err != nil || total == 0 {
		report("system", fmt.Errorf("cannot read memory (%v), is --pid=host set?", err))
	} else {
		report("system", nil)
	}
	return ok
}
