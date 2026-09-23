package unit

import (
	"os/exec"
	"strings"
	"testing"

	"github.com/orochibraru/baba/internal/service"
)

func TestUnit(t *testing.T) {
	unit := service.Unit("default.target")
	for _, want := range []string{"ExecStart=/usr/local/bin/baba start", "StandardOutput=append:/var/lib/baba/baba.log", "WantedBy=default.target\n"} {
		if !strings.Contains(unit, want) {
			t.Errorf("unit lacks %q", want)
		}
	}
}

func TestPlist(t *testing.T) {
	plist := service.Plist()
	if !strings.Contains(plist, "<string>com.orochibraru.baba</string>") || !strings.Contains(plist, "<string>/var/lib/baba/baba.log</string>") {
		t.Error(plist)
	}
	if lint, err := exec.LookPath("plutil"); err == nil {
		cmd := exec.Command(lint, "-lint", "-")
		cmd.Stdin = strings.NewReader(plist)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Errorf("plutil: %s", out)
		}
	}
}
