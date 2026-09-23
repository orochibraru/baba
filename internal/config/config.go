// Package config loads config.json, applies BABA_* env overrides and validates the result.
package config

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strings"
)

const SchemaURL = "https://raw.githubusercontent.com/orochibraru/baba/refs/heads/main/schema/config.schema.json"

type Config struct {
	Schema                  string     `json:"$schema,omitempty"`
	MachineName             string     `json:"machineName"`
	LogLevel                string     `json:"logLevel"`
	IntervalSeconds         float64    `json:"intervalSeconds"`
	ReminderIntervalMinutes float64    `json:"reminderIntervalMinutes"`
	Database                Database   `json:"database"`
	Checks                  Checks     `json:"checks"`
	Updates                 Updates    `json:"updates"`
	Notifiers               []Notifier `json:"notifiers"`
}

type Database struct {
	Path string `json:"path"`
}

type Updates struct {
	NotifyEnabled bool `json:"notifyEnabled"`
}

type Checks struct {
	CPU         UsageCheck       `json:"cpu"`
	Load        LoadCheck        `json:"load"`
	Memory      UsageCheck       `json:"memory"`
	Disk        DiskCheck        `json:"disk"`
	Temperature TemperatureCheck `json:"temperature"`
	GPU         GPUCheck         `json:"gpu"`
}

type UsageCheck struct {
	Enabled               bool    `json:"enabled"`
	UsageThresholdPercent float64 `json:"usageThresholdPercent"`
	ConsecutiveBreaches   int     `json:"consecutiveBreaches"`
}

type LoadCheck struct {
	Enabled             bool    `json:"enabled"`
	Threshold           float64 `json:"threshold"`
	ConsecutiveBreaches int     `json:"consecutiveBreaches"`
}

type DiskCheck struct {
	Enabled               bool     `json:"enabled"`
	UsageThresholdPercent float64  `json:"usageThresholdPercent"`
	Volumes               []string `json:"volumes"`
}

type TemperatureCheck struct {
	Enabled             bool    `json:"enabled"`
	CPUThresholdCelsius float64 `json:"cpuThresholdCelsius"`
	GPUThresholdCelsius float64 `json:"gpuThresholdCelsius"`
	ConsecutiveBreaches int     `json:"consecutiveBreaches"`
}

type GPUCheck struct {
	Enabled              bool    `json:"enabled"`
	VRAMThresholdPercent float64 `json:"vramThresholdPercent"`
	ConsecutiveBreaches  int     `json:"consecutiveBreaches"`
}

type Notifier struct {
	Type       string `json:"type"`
	WebhookURL string `json:"webhookUrl,omitempty"`
	BotToken   string `json:"botToken,omitempty"`
	ChatID     string `json:"chatId,omitempty"`
}

// Defaults is the config every file is decoded over, so missing keys keep these values.
func Defaults() Config {
	host, _ := os.Hostname()
	return Config{
		MachineName:             host,
		LogLevel:                "info",
		IntervalSeconds:         60,
		ReminderIntervalMinutes: 30,
		Database:                Database{Path: "/var/lib/baba/incidents.json"},
		Checks: Checks{
			CPU:         UsageCheck{Enabled: true, UsageThresholdPercent: 90, ConsecutiveBreaches: 3},
			Load:        LoadCheck{Enabled: true, Threshold: 8, ConsecutiveBreaches: 3},
			Memory:      UsageCheck{Enabled: true, UsageThresholdPercent: 90, ConsecutiveBreaches: 3},
			Disk:        DiskCheck{Enabled: true, UsageThresholdPercent: 90, Volumes: []string{"/"}},
			Temperature: TemperatureCheck{CPUThresholdCelsius: 85, GPUThresholdCelsius: 85, ConsecutiveBreaches: 3},
			GPU:         GPUCheck{VRAMThresholdPercent: 90, ConsecutiveBreaches: 3},
		},
		Updates: Updates{NotifyEnabled: true},
	}
}

// DefaultPath is where every command looks for config.json without --config.
func DefaultPath() string {
	if path := os.Getenv("BABA_CONFIG_PATH"); path != "" {
		return path
	}
	return "/var/lib/baba/config.json"
}

// Decode reads data over the defaults without validating, for the setup wizard.
func Decode(data []byte) (Config, error) {
	c := Defaults()
	err := json.Unmarshal(data, &c)
	return c, err
}

// Load reads path, restoring it from config.default.json next to it when missing, then applies env
// overrides and validates. With neither file, env vars alone can configure baba (e.g. in Docker).
func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	missing := errors.Is(err, os.ErrNotExist)
	if missing {
		template := filepath.Join(filepath.Dir(path), "config.default.json")
		if data, err = os.ReadFile(template); err == nil {
			slog.Warn("config not found, restoring it from the default template; run 'baba setup' to reconfigure", "path", path, "template", template)
			err = os.WriteFile(path, data, 0o644)
			missing = false
		} else if errors.Is(err, os.ErrNotExist) {
			data, err = []byte("{}"), nil
		}
	}
	if err != nil {
		return nil, err
	}
	c, err := Decode(data)
	if err != nil {
		return nil, fmt.Errorf("invalid config %s: %w", path, err)
	}
	if err := applyEnv(&c); err != nil {
		return nil, err
	}
	if err := c.validate(); err != nil {
		if missing {
			return nil, fmt.Errorf("no config file found at %q, run 'baba setup' to create one\n%w", path, err)
		}
		return nil, err
	}
	return &c, nil
}

// Write saves c as tab-indented JSON, the format setup and the example use.
func Write(path string, c Config) error {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetIndent("", "\t")
	enc.SetEscapeHTML(false)
	if err := enc.Encode(c); err != nil {
		return err
	}
	return os.WriteFile(path, buf.Bytes(), 0o600) // holds webhook URLs and bot tokens
}

func (c *Config) validate() error {
	var issues []string
	check := func(ok bool, field, message string) {
		if !ok {
			issues = append(issues, fmt.Sprintf("  • %s: %s", field, message))
		}
	}
	percent := func(v float64, field string) {
		check(v >= 0 && v <= 100, field, "Must be between 0 and 100")
	}
	breaches := func(v int, field string) {
		check(v >= 1, field, "Must be at least 1")
	}

	check(c.MachineName != "", "machineName", "Machine name cannot be empty")
	check(slices.Contains([]string{"trace", "debug", "info", "warn", "error"}, c.LogLevel), "logLevel", `Must be one of: "trace", "debug", "info", "warn", "error"`)
	check(c.IntervalSeconds > 0, "intervalSeconds", "Must be a positive number of seconds between checks (e.g. 60)")
	check(c.ReminderIntervalMinutes > 0, "reminderIntervalMinutes", "Must be a positive number of minutes between re-alerts for ongoing incidents (e.g. 30)")
	check(c.Database.Path != "", "database.path", "Database path cannot be empty")

	checks := c.Checks
	percent(checks.CPU.UsageThresholdPercent, "checks.cpu.usageThresholdPercent")
	breaches(checks.CPU.ConsecutiveBreaches, "checks.cpu.consecutiveBreaches")
	check(checks.Load.Threshold > 0, "checks.load.threshold", "Must be a positive 1-minute load average; a good rule of thumb is the number of CPU cores")
	breaches(checks.Load.ConsecutiveBreaches, "checks.load.consecutiveBreaches")
	percent(checks.Memory.UsageThresholdPercent, "checks.memory.usageThresholdPercent")
	breaches(checks.Memory.ConsecutiveBreaches, "checks.memory.consecutiveBreaches")
	percent(checks.Disk.UsageThresholdPercent, "checks.disk.usageThresholdPercent")
	check(len(checks.Disk.Volumes) > 0, "checks.disk.volumes", `Must include at least one mount point (e.g. ["/"])`)
	check(checks.Temperature.CPUThresholdCelsius > 0, "checks.temperature.cpuThresholdCelsius", "Must be a positive temperature in °C (e.g. 85)")
	check(checks.Temperature.GPUThresholdCelsius > 0, "checks.temperature.gpuThresholdCelsius", "Must be a positive temperature in °C (e.g. 85)")
	breaches(checks.Temperature.ConsecutiveBreaches, "checks.temperature.consecutiveBreaches")
	percent(checks.GPU.VRAMThresholdPercent, "checks.gpu.vramThresholdPercent")
	breaches(checks.GPU.ConsecutiveBreaches, "checks.gpu.consecutiveBreaches")

	check(len(c.Notifiers) > 0, "notifiers", "At least one notifier must be configured")
	for i, n := range c.Notifiers {
		field := fmt.Sprintf("notifiers.%d", i)
		switch n.Type {
		case "discord":
			u, err := url.Parse(n.WebhookURL)
			check(err == nil && (u.Scheme == "https" || u.Scheme == "http") && u.Host != "", field+".webhookUrl",
				`Must be a valid Discord webhook URL (e.g. "https://discord.com/api/webhooks/<id>/<token>")`)
		case "telegram":
			check(n.BotToken != "", field+".botToken", "Bot token cannot be empty, get one from @BotFather on Telegram")
			check(n.ChatID != "", field+".chatId", "Chat ID cannot be empty, use a user ID, group ID (prefixed with -), or @channelname")
		default:
			check(false, field+".type", fmt.Sprintf("Unknown notifier type %q. Registered types: discord, telegram", n.Type))
		}
	}

	if issues != nil {
		return errors.New("invalid config:\n" + strings.Join(issues, "\n"))
	}
	return nil
}
