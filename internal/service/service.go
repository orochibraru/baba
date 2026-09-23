// Package service registers baba as a background service: a launchd agent on macOS, a systemd unit on Linux.
package service

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

const (
	BinaryPath = "/usr/local/bin/baba"
	LibDir     = "/var/lib/baba"
	ConfigPath = LibDir + "/config.json"
	LogPath    = LibDir + "/baba.log"
	Label      = "com.orochibraru.baba"
	systemUnit = "/etc/systemd/system/baba.service"
)

func plistPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Library/LaunchAgents", Label+".plist")
}

func userUnit() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".config/systemd/user/baba.service")
}

func Plist() string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>` + Label + `</string>
	<key>ProgramArguments</key>
	<array>
		<string>` + BinaryPath + `</string>
		<string>start</string>
	</array>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
	<key>StandardOutPath</key>
	<string>` + LogPath + `</string>
	<key>StandardErrorPath</key>
	<string>` + LogPath + `</string>
</dict>
</plist>
`
}

// Unit is the systemd unit; wantedBy is multi-user.target for the system service, default.target for a user one.
func Unit(wantedBy string) string {
	return `[Unit]
Description=baba server monitor
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=` + BinaryPath + ` start
Restart=always
RestartSec=5
StandardOutput=append:` + LogPath + `
StandardError=append:` + LogPath + `

[Install]
WantedBy=` + wantedBy + `
`
}

// run executes a command with the terminal attached, so sudo can prompt; errors carry its output.
func run(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.Stdin = os.Stdin
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%s %s: %v: %s", name, strings.Join(args, " "), err, strings.TrimSpace(string(out)))
	}
	return nil
}

func runAll(commands ...[]string) error {
	for _, c := range commands {
		if err := run(c[0], c[1:]...); err != nil {
			return err
		}
	}
	return nil
}

func Install() error {
	if _, err := os.Stat(ConfigPath); err != nil {
		return fmt.Errorf("no config found at %s, run 'baba setup' first", ConfigPath)
	}
	switch runtime.GOOS {
	case "darwin":
		path := plistPath()
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(path, []byte(Plist()), 0o644); err != nil {
			return err
		}
		fmt.Println("Wrote", path)
		_ = run("launchctl", "unload", path) // not loaded yet on a first install
		if err := run("launchctl", "load", "-w", path); err != nil {
			return err
		}
		fmt.Printf("Service loaded, baba will start on login and restart automatically.\nLogs: %s\n", LogPath)
		return nil
	case "linux":
		tmp, err := os.CreateTemp("", "baba-*.service")
		if err != nil {
			return err
		}
		defer os.Remove(tmp.Name())
		if _, err := tmp.WriteString(Unit("multi-user.target")); err != nil {
			return err
		}
		tmp.Close()
		if run("sudo", "cp", tmp.Name(), systemUnit) == nil {
			if err := runAll([]string{"sudo", "systemctl", "daemon-reload"}, []string{"sudo", "systemctl", "enable", "baba"}, []string{"sudo", "systemctl", "restart", "baba"}); err != nil {
				return err
			}
			fmt.Printf("Wrote %s\nSystem service enabled and started, baba runs on boot.\nCheck status: sudo systemctl status baba\nLogs: baba logs -f\n", systemUnit)
			return nil
		}
		fmt.Println("No sudo access, installing as a user service instead.\nNote: user services only run while you are logged in.")
		path := userUnit()
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(path, []byte(Unit("default.target")), 0o644); err != nil {
			return err
		}
		fmt.Println("Wrote", path)
		if err := runAll([]string{"systemctl", "--user", "daemon-reload"}, []string{"systemctl", "--user", "enable", "baba"}, []string{"systemctl", "--user", "restart", "baba"}); err != nil {
			return err
		}
		fmt.Println("User service enabled and started.\nCheck status: systemctl --user status baba\nLogs: baba logs -f")
		return nil
	}
	return fmt.Errorf("unsupported platform: %s", runtime.GOOS)
}

func Restart() error {
	switch runtime.GOOS {
	case "darwin":
		if _, err := os.Stat(plistPath()); err != nil {
			return fmt.Errorf("no service installed at %s, run 'baba install' first", plistPath())
		}
		if err := run("launchctl", "kickstart", "-k", fmt.Sprintf("gui/%d/%s", os.Getuid(), Label)); err != nil {
			return err
		}
		fmt.Println("Service restarted.")
		return nil
	case "linux":
		if _, err := os.Stat(systemUnit); err == nil {
			if err := run("sudo", "systemctl", "restart", "baba"); err != nil {
				return err
			}
			fmt.Println("System service restarted.")
			return nil
		}
		if _, err := os.Stat(userUnit()); err == nil {
			if err := run("systemctl", "--user", "restart", "baba"); err != nil {
				return err
			}
			fmt.Println("User service restarted.")
			return nil
		}
		return fmt.Errorf("no service installed, run 'baba install' first")
	}
	return fmt.Errorf("unsupported platform: %s", runtime.GOOS)
}

// Uninstall removes the service, best effort since it may already be stopped; purge also deletes LibDir.
func Uninstall(purge bool) error {
	removed := false
	switch runtime.GOOS {
	case "darwin":
		if path := plistPath(); exists(path) {
			_ = run("launchctl", "unload", path)
			if err := os.Remove(path); err != nil {
				return err
			}
			fmt.Printf("Removed %s. Service unregistered.\n", path)
			removed = true
		}
	case "linux":
		if exists(systemUnit) {
			for _, c := range [][]string{{"systemctl", "stop", "baba"}, {"systemctl", "disable", "baba"}, {"rm", "-f", systemUnit}, {"systemctl", "daemon-reload"}} {
				_ = run("sudo", c...)
			}
			fmt.Printf("Removed %s. System service unregistered.\n", systemUnit)
			removed = true
		}
		if path := userUnit(); exists(path) {
			_ = run("systemctl", "--user", "stop", "baba")
			_ = run("systemctl", "--user", "disable", "baba")
			if err := os.Remove(path); err != nil {
				return err
			}
			_ = run("systemctl", "--user", "daemon-reload")
			fmt.Printf("Removed %s. User service unregistered.\n", path)
			removed = true
		}
	default:
		return fmt.Errorf("unsupported platform: %s", runtime.GOOS)
	}
	if !removed {
		fmt.Println("No service installed, nothing to do.")
	}
	if !purge {
		fmt.Printf("Config and data left in place at %s. Re-run with --purge to remove them too.\n", LibDir)
		return nil
	}
	if err := os.RemoveAll(LibDir); err != nil {
		return err
	}
	fmt.Printf("Removed %s (config, incidents, logs).\n", LibDir)
	return nil
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
