package config

import (
	"fmt"
	"log/slog"
	"os"
	"slices"
	"strconv"
	"strings"
)

// EnvVars maps each BABA_* variable to the field it overrides; docs/env.md documents them all.
var EnvVars = []struct {
	Name  string
	Field func(*Config) any
}{
	{"BABA_LOG_LEVEL", func(c *Config) any { return &c.LogLevel }},
	{"BABA_MACHINE_NAME", func(c *Config) any { return &c.MachineName }},
	{"BABA_INTERVAL_SECONDS", func(c *Config) any { return &c.IntervalSeconds }},
	{"BABA_REMINDER_INTERVAL_MINUTES", func(c *Config) any { return &c.ReminderIntervalMinutes }},
	{"BABA_DATABASE_PATH", func(c *Config) any { return &c.Database.Path }},
	{"BABA_CPU_ENABLED", func(c *Config) any { return &c.Checks.CPU.Enabled }},
	{"BABA_CPU_THRESHOLD", func(c *Config) any { return &c.Checks.CPU.UsageThresholdPercent }},
	{"BABA_CPU_CONSECUTIVE_BREACHES", func(c *Config) any { return &c.Checks.CPU.ConsecutiveBreaches }},
	{"BABA_LOAD_ENABLED", func(c *Config) any { return &c.Checks.Load.Enabled }},
	{"BABA_LOAD_THRESHOLD", func(c *Config) any { return &c.Checks.Load.Threshold }},
	{"BABA_LOAD_CONSECUTIVE_BREACHES", func(c *Config) any { return &c.Checks.Load.ConsecutiveBreaches }},
	{"BABA_MEMORY_ENABLED", func(c *Config) any { return &c.Checks.Memory.Enabled }},
	{"BABA_MEMORY_THRESHOLD", func(c *Config) any { return &c.Checks.Memory.UsageThresholdPercent }},
	{"BABA_MEMORY_CONSECUTIVE_BREACHES", func(c *Config) any { return &c.Checks.Memory.ConsecutiveBreaches }},
	{"BABA_DISK_ENABLED", func(c *Config) any { return &c.Checks.Disk.Enabled }},
	{"BABA_DISK_THRESHOLD", func(c *Config) any { return &c.Checks.Disk.UsageThresholdPercent }},
	{"BABA_DISK_VOLUMES", func(c *Config) any { return &c.Checks.Disk.Volumes }},
	{"BABA_TEMP_ENABLED", func(c *Config) any { return &c.Checks.Temperature.Enabled }},
	{"BABA_TEMP_CPU_THRESHOLD", func(c *Config) any { return &c.Checks.Temperature.CPUThresholdCelsius }},
	{"BABA_TEMP_GPU_THRESHOLD", func(c *Config) any { return &c.Checks.Temperature.GPUThresholdCelsius }},
	{"BABA_TEMP_CONSECUTIVE_BREACHES", func(c *Config) any { return &c.Checks.Temperature.ConsecutiveBreaches }},
	{"BABA_GPU_ENABLED", func(c *Config) any { return &c.Checks.GPU.Enabled }},
	{"BABA_GPU_THRESHOLD", func(c *Config) any { return &c.Checks.GPU.VRAMThresholdPercent }},
	{"BABA_GPU_CONSECUTIVE_BREACHES", func(c *Config) any { return &c.Checks.GPU.ConsecutiveBreaches }},
	{"BABA_UPDATES_NOTIFY_ENABLED", func(c *Config) any { return &c.Updates.NotifyEnabled }},
}

func applyEnv(c *Config) error {
	for _, v := range EnvVars {
		value := os.Getenv(v.Name)
		if value == "" {
			continue
		}
		var err error
		switch field := v.Field(c).(type) {
		case *string:
			*field = value
		case *bool:
			*field = value == "true" || value == "1"
		case *float64:
			*field, err = strconv.ParseFloat(value, 64)
		case *int:
			*field, err = strconv.Atoi(value)
		case *[]string:
			*field = nil
			for s := range strings.SplitSeq(value, ",") {
				if s = strings.TrimSpace(s); s != "" {
					*field = append(*field, s)
				}
			}
		}
		if err != nil {
			return fmt.Errorf("invalid value for %s=%q: must be a number", v.Name, value)
		}
		slog.Debug("env override applied", "name", v.Name)
	}

	// An env notifier replaces the file's notifiers of the same type and keeps the others.
	replace := func(n Notifier) {
		c.Notifiers = append(slices.DeleteFunc(c.Notifiers, func(existing Notifier) bool { return existing.Type == n.Type }), n)
	}
	if url := os.Getenv("BABA_NOTIFIERS_DISCORD_WEBHOOK_URL"); url != "" {
		replace(Notifier{Type: "discord", WebhookURL: url})
	}
	token, chat := os.Getenv("BABA_NOTIFIERS_TELEGRAM_BOT_TOKEN"), os.Getenv("BABA_NOTIFIERS_TELEGRAM_CHAT_ID")
	switch {
	case token != "" && chat != "":
		replace(Notifier{Type: "telegram", BotToken: token, ChatID: chat})
	case token != "" || chat != "":
		slog.Warn("BABA_NOTIFIERS_TELEGRAM_BOT_TOKEN and BABA_NOTIFIERS_TELEGRAM_CHAT_ID must both be set, ignoring them")
	}
	return nil
}
