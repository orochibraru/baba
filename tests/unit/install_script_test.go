package unit

import (
	"os"
	"os/exec"
	"runtime"
	"strings"
	"testing"

	"github.com/orochibraru/baba/internal/update"
)

// install.sh and 'baba update' must agree on asset names, and so must every release since the Bun builds.
func TestInstallScriptAsset(t *testing.T) {
	for version, url := range map[string]string{
		"latest": "https://github.com/orochibraru/baba/releases/latest/download/" + update.Asset() + ".gz",
		"1.2.3":  "https://github.com/orochibraru/baba/releases/download/v1.2.3/" + update.Asset() + ".gz",
	} {
		cmd := exec.Command("sh", "../../scripts/install.sh")
		cmd.Env = append(os.Environ(), "DRY_RUN=1", "VERSION="+version, "INSTALL_DIR=/opt/bin")
		out, err := cmd.Output()
		if err != nil {
			t.Fatal(err)
		}
		for _, want := range []string{"asset=" + update.Asset(), "url=" + url, "install_dir=/opt/bin"} {
			if !strings.Contains(string(out), want+"\n") {
				t.Errorf("%s: output lacks %q:\n%s", version, want, out)
			}
		}
	}
	if runtime.GOARCH == "amd64" && !strings.HasSuffix(update.Asset(), "-x64") {
		t.Errorf("asset %q breaks updates from the Bun builds", update.Asset())
	}
}
