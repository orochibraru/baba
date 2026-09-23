// Command baba monitors a homelab server and alerts on Discord or Telegram when something goes wrong.
package main

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"strconv"

	"github.com/orochibraru/baba/internal/config"
	"github.com/orochibraru/baba/internal/logs"
	"github.com/orochibraru/baba/internal/notify"
	"github.com/orochibraru/baba/internal/service"
)

// version is set at build time with -ldflags "-X main.version=1.2.3".
var version = "dev"

var logLevel = new(slog.LevelVar)

const usage = `baba: monitor your homelab server and alert on issues.

Usage: baba <command> [flags]

Commands:
  setup [--config path]              interactive wizard, writes config.json
  install                            register the background service (launchd on macOS, systemd on Linux)
  restart                            restart the background service
  uninstall [--purge]                remove the background service; --purge also deletes /var/lib/baba
  start [--config path]              run the monitor in the foreground
  logs [-f] [-n lines]               show the background service's logs
  update                             replace this binary with the latest release
  health [--config path]             check the config, incident store and system metrics
  validate [--config path]           send a test alert through every notifier
  list incidents [-n limit] [--config path]
  get incident <id> [--config path]
  version, -v, --version             print the version
`

func main() {
	stat, _ := os.Stdout.Stat()
	options := &slog.HandlerOptions{Level: logLevel}
	var handler slog.Handler = slog.NewJSONHandler(os.Stdout, options)
	if stat != nil && stat.Mode()&os.ModeCharDevice != 0 {
		handler = slog.NewTextHandler(os.Stdout, options)
	}
	slog.SetDefault(slog.New(handler))

	if err := run(os.Args[1:]); err != nil {
		if !errors.Is(err, flag.ErrHelp) {
			fmt.Fprintln(os.Stderr, "baba:", err)
		}
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) == 0 {
		fmt.Print(usage)
		return nil
	}
	command, args := args[0], args[1:]
	if len(args) > 0 && (command == "list" && args[0] == "incidents" || command == "get" && args[0] == "incident") {
		command, args = command+" "+args[0], args[1:]
	}

	flags := flag.NewFlagSet("baba "+command, flag.ContinueOnError)
	configPath := flags.String("config", config.DefaultPath(), "path to config.json")
	var follow, purge bool
	var lines int
	flags.BoolVar(&follow, "f", false, "stream new log entries as they arrive")
	flags.BoolVar(&follow, "follow", false, "stream new log entries as they arrive")
	flags.BoolVar(&purge, "purge", false, "also remove config, incidents and logs from "+service.LibDir)
	defaultLines := map[string]int{"logs": 100, "list incidents": 50}[command]
	for _, name := range []string{"n", "lines", "limit"} {
		flags.IntVar(&lines, name, defaultLines, "number of entries to show")
	}
	positional, err := parse(flags, args)
	if err != nil {
		return err
	}

	switch command {
	case "version", "-v", "--version":
		fmt.Println(version)
		return nil
	case "help", "-h", "--help":
		fmt.Print(usage)
		return nil
	case "start":
		return start(*configPath)
	case "setup":
		return setup(*configPath, os.Stdin, os.Stdout)
	case "health":
		if !health(*configPath) {
			os.Exit(1)
		}
		return nil
	case "validate":
		c, err := load(*configPath)
		if err != nil {
			return err
		}
		if err := notify.Alert(c.Notifiers, "This is a test alert."); err != nil {
			return fmt.Errorf("test alert failed: %w", err)
		}
		fmt.Println("Test alert sent successfully.")
		return nil
	case "logs":
		err := logs.Print(os.Stdout, service.LogPath, lines, follow)
		if errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("no log file at %s, run 'baba install' to set up the background service", service.LogPath)
		}
		return err
	case "install":
		return service.Install()
	case "restart":
		return service.Restart()
	case "uninstall":
		return service.Uninstall(purge)
	case "update":
		return selfUpdate()
	case "list incidents":
		return listIncidents(os.Stdout, *configPath, lines)
	case "get incident":
		if len(positional) != 1 {
			return errors.New("usage: baba get incident <id>")
		}
		id, err := strconv.Atoi(positional[0])
		if err != nil {
			return fmt.Errorf("bad incident id %q", positional[0])
		}
		return getIncident(os.Stdout, *configPath, id)
	}
	fmt.Fprint(os.Stderr, usage)
	return fmt.Errorf("unknown command %q", command)
}

// parse accepts flags before and after positional arguments ("get incident 3 --config x").
func parse(flags *flag.FlagSet, args []string) ([]string, error) {
	flags.SetOutput(io.Discard)
	var positional []string
	for {
		if err := flags.Parse(args); err != nil {
			if !errors.Is(err, flag.ErrHelp) {
				return nil, err
			}
			flags.SetOutput(os.Stderr)
			flags.PrintDefaults()
			return nil, err
		}
		if flags.NArg() == 0 {
			return positional, nil
		}
		positional = append(positional, flags.Arg(0))
		args = flags.Args()[1:]
	}
}

// load reads the config and applies its log level.
func load(path string) (*config.Config, error) {
	c, err := config.Load(path)
	if err != nil {
		return nil, err
	}
	levels := map[string]slog.Level{"trace": slog.LevelDebug - 4, "debug": slog.LevelDebug, "info": slog.LevelInfo, "warn": slog.LevelWarn, "error": slog.LevelError}
	logLevel.Set(levels[c.LogLevel])
	return c, nil
}
