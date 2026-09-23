package integration

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"
)

// Answers to every setup prompt, in order: thresholds at 0 so the real host breaches on the first reading.
func answers(webhook, store string) string {
	return strings.Join([]string{
		"test-server", "1", "", store, // name, interval, reminder, store
		"y", webhook, "n", // discord, telegram
		"y", "0", "1", // cpu
		"y", "1000", "1", // load, never breached
		"y", "0", "1", // memory
		"y", "0", "/", // disk
		"y", "", "", "", // temperature, with sensors or not
		"y", "", "", // gpu, with nvidia-smi or not
	}, "\n") + "\n"
}

func TestSetupStartAndInspect(t *testing.T) {
	fake := newDiscord(t)
	dir := t.TempDir()
	env := []string{"BABA_CONFIG_PATH=" + filepath.Join(dir, "config.json"), "BABA_UPDATES_NOTIFY_ENABLED=false"}

	out, err := baba(t, env, answers(fake.URL, filepath.Join(dir, "data", "incidents.json")), "setup")
	if err != nil || !strings.Contains(out, "Config written to") {
		t.Fatalf("setup: %v\n%s", err, out)
	}
	config, _ := os.ReadFile(filepath.Join(dir, "config.json"))
	for _, want := range []string{`"machineName": "test-server"`, `"intervalSeconds": 1,`, `"$schema"`, fake.URL} {
		if !bytes.Contains(config, []byte(want)) {
			t.Errorf("config.json lacks %s:\n%s", want, config)
		}
	}

	if out, err := baba(t, env, "", "health"); err == nil || !strings.Contains(out, "✗ incidents") {
		t.Errorf("health before the first start: %v\n%s", err, out)
	}
	if out, err := baba(t, env, "", "validate"); err != nil || fake.received() != "This is a test alert." {
		t.Fatalf("validate: %v\n%s\nreceived: %s", err, out, fake.received())
	}

	start := command(t, env, "start")
	var output bytes.Buffer
	start.Stdout, start.Stderr = &output, &output
	if err := start.Start(); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(20 * time.Second)
	for !(strings.Contains(fake.received(), "CPU LOAD") && strings.Contains(fake.received(), "MEMORY USAGE") && strings.Contains(fake.received(), "DISK USAGE")) {
		if time.Now().After(deadline) {
			_ = start.Process.Kill()
			t.Fatalf("no alerts after 20s:\n%s\noutput:\n%s", fake.received(), output.String())
		}
		time.Sleep(100 * time.Millisecond)
	}
	_ = start.Process.Signal(syscall.SIGTERM)
	if err := start.Wait(); err != nil {
		t.Fatalf("start exited with %v:\n%s", err, output.String())
	}
	if !strings.Contains(output.String(), "shutting down") || strings.Contains(fake.received(), "LOAD CRITICAL") {
		t.Errorf("output:\n%s\nreceived:\n%s", output.String(), fake.received())
	}
	if !strings.Contains(fake.received(), "[test-server] ⚠️ **CPU LOAD**: Usage is at **") {
		t.Errorf("alert format:\n%s", fake.received())
	}

	// An idle host can read 0% CPU, which isn't above a 0 threshold: incidents may resolve, so count rows, not OPEN.
	rows := func(out string) int { return strings.Count(out, "OPEN") + strings.Count(out, "RESOLVED") }
	out, err = baba(t, env, "", "list", "incidents")
	if err != nil || rows(out) < 3 || !strings.Contains(out, "cpu") || !strings.Contains(out, "memory") || !strings.Contains(out, "disk") {
		t.Errorf("list incidents: %v\n%s", err, out)
	}
	if out, _ := baba(t, env, "", "list", "incidents", "-n", "1"); rows(out) != 1 {
		t.Errorf("list incidents -n 1:\n%s", out)
	}
	out, err = baba(t, env, "", "get", "incident", "1", "--config", filepath.Join(dir, "config.json"))
	if err != nil || !strings.Contains(out, "Incident #1") || !strings.Contains(out, "alert      ✓") {
		t.Errorf("get incident: %v\n%s", err, out)
	}
	if out, err := baba(t, env, "", "health"); err != nil || strings.Count(out, "✓") != 3 {
		t.Errorf("health: %v\n%s", err, out)
	}

	// Running setup again keeps every answer given the first time.
	if out, err := baba(t, env, "", "setup"); err != nil || !strings.Contains(out, "Found existing config") {
		t.Fatalf("setup again: %v\n%s", err, out)
	}
	if again, _ := os.ReadFile(filepath.Join(dir, "config.json")); !bytes.Equal(again, config) {
		t.Errorf("config changed:\n%s", again)
	}
}

func TestEnvOnlyConfig(t *testing.T) {
	fake := newDiscord(t)
	env := []string{"BABA_CONFIG_PATH=" + filepath.Join(t.TempDir(), "config.json"), "BABA_NOTIFIERS_DISCORD_WEBHOOK_URL=" + fake.URL}
	if out, err := baba(t, env, "", "validate"); err != nil || fake.received() != "This is a test alert." {
		t.Fatalf("validate: %v\n%s", err, out)
	}
}

func TestCommandErrors(t *testing.T) {
	missing := []string{"BABA_CONFIG_PATH=" + filepath.Join(t.TempDir(), "config.json")}
	for _, c := range []struct {
		args []string
		want string
	}{
		{[]string{"start"}, "run 'baba setup' to create one"},
		{[]string{"validate"}, "At least one notifier must be configured"},
		{[]string{"get", "incident"}, "usage: baba get incident <id>"},
		{[]string{"get", "incident", "x"}, `bad incident id "x"`},
		{[]string{"list", "incidents", "--nope"}, "flag provided but not defined: -nope"},
		{[]string{"frobnicate"}, `unknown command "frobnicate"`},
	} {
		out, err := baba(t, missing, "", c.args...)
		if err == nil || !strings.Contains(out, c.want) {
			t.Errorf("baba %s: %v\n%s", strings.Join(c.args, " "), err, out)
		}
	}
}

func TestVersionAndHelp(t *testing.T) {
	for _, args := range [][]string{{"version"}, {"-v"}, {"--version"}} {
		if out, err := baba(t, nil, "", args...); err != nil || out != "1.2.3\n" {
			t.Errorf("baba %s = %q, %v", args[0], out, err)
		}
	}
	if out, err := baba(t, nil, ""); err != nil || !strings.Contains(out, "Usage: baba <command>") {
		t.Errorf("baba: %v\n%s", err, out)
	}
}
