package unit

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/orochibraru/baba/internal/config"
)

func writeConfig(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

const discord = `"notifiers": [{"type": "discord", "webhookUrl": "https://discord.com/api/webhooks/1/x"}]`

func TestLoadAppliesDefaults(t *testing.T) {
	c, err := config.Load(writeConfig(t, `{`+discord+`}`))
	if err != nil {
		t.Fatal(err)
	}
	if c.IntervalSeconds != 60 || c.Checks.CPU.ConsecutiveBreaches != 3 || !c.Checks.Disk.Enabled || c.Checks.Disk.Volumes[0] != "/" || c.Checks.GPU.Enabled || !c.Updates.NotifyEnabled || c.MachineName == "" {
		t.Errorf("defaults not applied: %+v", c)
	}
}

func TestLoadKeepsDefaultsOfPartialSections(t *testing.T) {
	c, err := config.Load(writeConfig(t, `{"checks": {"cpu": {"usageThresholdPercent": 50}}, `+discord+`}`))
	if err != nil {
		t.Fatal(err)
	}
	if c.Checks.CPU.UsageThresholdPercent != 50 || !c.Checks.CPU.Enabled || c.Checks.CPU.ConsecutiveBreaches != 3 {
		t.Errorf("cpu = %+v", c.Checks.CPU)
	}
}

func TestExampleConfigIsValid(t *testing.T) {
	if _, err := config.Load("../../config.example.json"); err != nil {
		t.Fatal(err)
	}
}

func TestLoadRejectsInvalidValues(t *testing.T) {
	_, err := config.Load(writeConfig(t, `{"logLevel": "loud", "intervalSeconds": -1,
		"checks": {"cpu": {"usageThresholdPercent": 101, "consecutiveBreaches": 0}, "disk": {"volumes": []}},
		"notifiers": [{"type": "discord", "webhookUrl": "nope"}, {"type": "telegram"}, {"type": "pigeon"}]}`))
	if err == nil {
		t.Fatal("no error")
	}
	for _, want := range []string{"logLevel", "intervalSeconds", "checks.cpu.usageThresholdPercent", "checks.cpu.consecutiveBreaches",
		"checks.disk.volumes", "notifiers.0.webhookUrl", "notifiers.1.botToken", "notifiers.1.chatId", `Unknown notifier type "pigeon"`} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error lacks %q:\n%v", want, err)
		}
	}
}

func TestLoadRequiresANotifier(t *testing.T) {
	_, err := config.Load(writeConfig(t, `{}`))
	if err == nil || !strings.Contains(err.Error(), "At least one notifier") {
		t.Fatalf("err = %v", err)
	}
}

func TestLoadRejectsWrongTypes(t *testing.T) {
	if _, err := config.Load(writeConfig(t, `{"intervalSeconds": "often", `+discord+`}`)); err == nil {
		t.Fatal("no error")
	}
}

func TestLoadRestoresFromTemplate(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "config.default.json"), []byte(`{"machineName": "from-template", `+discord+`}`), 0o644); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "config.json")
	c, err := config.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if c.MachineName != "from-template" {
		t.Errorf("machineName = %q", c.MachineName)
	}
	if _, err := os.Stat(path); err != nil {
		t.Errorf("config.json not restored: %v", err)
	}
}

func TestLoadWithoutFileNeedsEnv(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	if _, err := config.Load(path); err == nil || !strings.Contains(err.Error(), "baba setup") {
		t.Fatalf("err = %v", err)
	}
	t.Setenv("BABA_NOTIFIERS_DISCORD_WEBHOOK_URL", "https://discord.com/api/webhooks/1/x")
	if _, err := config.Load(path); err != nil {
		t.Fatal(err)
	}
}

func TestEnvOverrides(t *testing.T) {
	t.Setenv("BABA_MACHINE_NAME", "nas-01")
	t.Setenv("BABA_CPU_THRESHOLD", "80")
	t.Setenv("BABA_CPU_CONSECUTIVE_BREACHES", "5")
	t.Setenv("BABA_GPU_ENABLED", "1")
	t.Setenv("BABA_UPDATES_NOTIFY_ENABLED", "false")
	t.Setenv("BABA_DISK_VOLUMES", " /, /data ,,")
	t.Setenv("BABA_NOTIFIERS_TELEGRAM_BOT_TOKEN", "token")
	t.Setenv("BABA_NOTIFIERS_TELEGRAM_CHAT_ID", "-100")
	c, err := config.Load(writeConfig(t, `{"notifiers": [{"type": "telegram", "botToken": "old", "chatId": "old"}, {"type": "discord", "webhookUrl": "https://d.example/x"}]}`))
	if err != nil {
		t.Fatal(err)
	}
	if c.MachineName != "nas-01" || c.Checks.CPU.UsageThresholdPercent != 80 || c.Checks.CPU.ConsecutiveBreaches != 5 || !c.Checks.GPU.Enabled || c.Updates.NotifyEnabled {
		t.Errorf("overrides not applied: %+v", c)
	}
	if got := strings.Join(c.Checks.Disk.Volumes, "|"); got != "/|/data" {
		t.Errorf("volumes = %q", got)
	}
	if len(c.Notifiers) != 2 || c.Notifiers[0].Type != "discord" || c.Notifiers[1].BotToken != "token" {
		t.Errorf("notifiers = %+v", c.Notifiers)
	}
}

func TestEnvHalfTelegramIsIgnored(t *testing.T) {
	t.Setenv("BABA_NOTIFIERS_TELEGRAM_BOT_TOKEN", "token")
	c, err := config.Load(writeConfig(t, `{`+discord+`}`))
	if err != nil {
		t.Fatal(err)
	}
	if len(c.Notifiers) != 1 {
		t.Errorf("notifiers = %+v", c.Notifiers)
	}
}

func TestEnvRejectsBadNumbers(t *testing.T) {
	t.Setenv("BABA_INTERVAL_SECONDS", "soon")
	if _, err := config.Load(writeConfig(t, `{`+discord+`}`)); err == nil || !strings.Contains(err.Error(), "BABA_INTERVAL_SECONDS") {
		t.Fatalf("err = %v", err)
	}
}

func TestEveryEnvVarIsDocumented(t *testing.T) {
	doc, err := os.ReadFile("../../docs/env.md")
	if err != nil {
		t.Fatal(err)
	}
	for _, v := range config.EnvVars {
		if !strings.Contains(string(doc), "`"+v.Name+"`") {
			t.Errorf("%s missing from docs/env.md", v.Name)
		}
	}
}

func TestWriteRoundTrips(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	want := config.Defaults()
	want.Notifiers = []config.Notifier{{Type: "discord", WebhookURL: "https://discord.com/api/webhooks/1/x?a=b&c=d"}}
	if err := config.Write(path, want); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(path)
	if !strings.Contains(string(data), "\t\"machineName\"") || !strings.Contains(string(data), "a=b&c=d") {
		t.Errorf("unexpected format:\n%s", data)
	}
	got, err := config.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if got.Notifiers[0] != want.Notifiers[0] {
		t.Errorf("notifiers = %+v", got.Notifiers)
	}
}
