package main

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"slices"
	"strconv"
	"strings"

	"github.com/orochibraru/baba/internal/config"
)

// setup asks for every setting, the current value (or default) as the answer to an empty line.
func setup(path string, in io.Reader, out io.Writer) error {
	c := config.Defaults()
	if data, err := os.ReadFile(path); err != nil {
		fmt.Fprintf(out, "\nNo config at %s, creating a new one.\n", path)
	} else if c, err = config.Decode(data); err != nil {
		c = config.Defaults()
		fmt.Fprintf(out, "\nCould not parse %s, starting fresh.\n", path)
	} else {
		fmt.Fprintf(out, "\nFound existing config at %s, press Enter to keep current values.\n", path)
	}

	scanner := bufio.NewScanner(in)
	line := func(label, hint string) string {
		fmt.Fprintf(out, "  %s [%s]: ", label, hint)
		if scanner.Scan() {
			return strings.TrimSpace(scanner.Text())
		}
		return ""
	}
	ask := func(label, current string) string {
		if answer := line(label, current); answer != "" {
			return answer
		}
		return current
	}
	text := func(label string, p *string) { *p = ask(label, *p) }
	number := func(label string, p *float64) {
		answer := ask(label, strconv.FormatFloat(*p, 'f', -1, 64))
		if n, err := strconv.ParseFloat(answer, 64); err == nil {
			*p = n
		} else {
			fmt.Fprintf(out, "  Invalid number, keeping %g\n", *p)
		}
	}
	integer := func(label string, p *int) {
		answer := ask(label, strconv.Itoa(*p))
		if n, err := strconv.Atoi(answer); err == nil {
			*p = n
		} else {
			fmt.Fprintf(out, "  Invalid number, keeping %d\n", *p)
		}
	}
	yes := func(label string, current bool) bool {
		answer := strings.ToLower(line(label, map[bool]string{true: "Y/n", false: "y/N"}[current]))
		if answer == "" {
			return current
		}
		return answer == "y" || answer == "yes"
	}
	section := func(title string) {
		fmt.Fprintf(out, "\n── %s %s\n", title, strings.Repeat("─", max(0, 53-len(title))))
	}

	section("General")
	text("Machine name", &c.MachineName)
	number("Check interval (seconds)", &c.IntervalSeconds)
	number("Reminder interval (minutes)", &c.ReminderIntervalMinutes)
	text("Incident store path", &c.Database.Path)

	section("Notifiers")
	find := func(kind string) (config.Notifier, bool) {
		i := slices.IndexFunc(c.Notifiers, func(n config.Notifier) bool { return n.Type == kind })
		if i < 0 {
			return config.Notifier{Type: kind}, false
		}
		return c.Notifiers[i], true
	}
	var notifiers []config.Notifier
	if discord, found := find("discord"); yes("Set up Discord notifier?", found) {
		text("Webhook URL (Channel Settings → Integrations → Webhooks)", &discord.WebhookURL)
		if discord.WebhookURL != "" {
			notifiers = append(notifiers, discord)
		}
	}
	if telegram, found := find("telegram"); yes("Set up Telegram notifier?", found) {
		text("Bot token (from @BotFather)", &telegram.BotToken)
		text("Chat ID (user ID, group ID prefixed with -, or @channel)", &telegram.ChatID)
		if telegram.BotToken != "" && telegram.ChatID != "" {
			notifiers = append(notifiers, telegram)
		}
	}
	c.Notifiers = notifiers

	section("Checks")
	checks := &c.Checks
	if checks.CPU.Enabled = yes("CPU monitoring enabled?", checks.CPU.Enabled); checks.CPU.Enabled {
		number("  CPU usage threshold (%)", &checks.CPU.UsageThresholdPercent)
		integer("  Consecutive breaches before alert", &checks.CPU.ConsecutiveBreaches)
	}
	if checks.Load.Enabled = yes("Load average monitoring enabled?", checks.Load.Enabled); checks.Load.Enabled {
		number("  Load threshold (tip: # of CPU cores)", &checks.Load.Threshold)
		integer("  Consecutive breaches before alert", &checks.Load.ConsecutiveBreaches)
	}
	if checks.Memory.Enabled = yes("Memory monitoring enabled?", checks.Memory.Enabled); checks.Memory.Enabled {
		number("  Memory usage threshold (%)", &checks.Memory.UsageThresholdPercent)
		integer("  Consecutive breaches before alert", &checks.Memory.ConsecutiveBreaches)
	}
	if checks.Disk.Enabled = yes("Disk monitoring enabled?", checks.Disk.Enabled); checks.Disk.Enabled {
		number("  Disk usage threshold (%)", &checks.Disk.UsageThresholdPercent)
		volumes := strings.Join(checks.Disk.Volumes, ", ")
		text("  Volumes to monitor (comma-separated)", &volumes)
		checks.Disk.Volumes = nil
		for v := range strings.SplitSeq(volumes, ",") {
			if v = strings.TrimSpace(v); v != "" {
				checks.Disk.Volumes = append(checks.Disk.Volumes, v)
			}
		}
	}
	if checks.Temperature.Enabled = yes("Temperature monitoring enabled? (Linux)", checks.Temperature.Enabled); checks.Temperature.Enabled {
		number("  CPU threshold (°C)", &checks.Temperature.CPUThresholdCelsius)
		number("  GPU threshold (°C)", &checks.Temperature.GPUThresholdCelsius)
		integer("  Consecutive breaches before alert", &checks.Temperature.ConsecutiveBreaches)
	}
	if checks.GPU.Enabled = yes("GPU VRAM monitoring enabled? (NVIDIA)", checks.GPU.Enabled); checks.GPU.Enabled {
		number("  VRAM usage threshold (%)", &checks.GPU.VRAMThresholdPercent)
		integer("  Consecutive breaches before alert", &checks.GPU.ConsecutiveBreaches)
	}

	c.Schema = config.SchemaURL
	if err := config.Write(path, c); err != nil {
		return err
	}
	fmt.Fprintf(out, "\nConfig written to %s\n", path)
	if len(notifiers) == 0 {
		fmt.Fprintln(out, "Warning: no notifiers configured, run 'baba setup' again or set BABA_NOTIFIERS_DISCORD_WEBHOOK_URL.")
	} else {
		fmt.Fprintln(out, "Run 'baba validate' to test your notifiers, then 'baba start' to begin monitoring.")
	}
	return nil
}
