// Integration: build the real binary once and drive it like a user, alerts going to a fake Discord.
package integration

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

var bin string

// coverDir, when set (by .github/scripts/coverage.sh), gets the coverage of every run of the binary.
var coverDir = os.Getenv("BABA_COVERDIR")

func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "baba-bin")
	if err != nil {
		panic(err)
	}
	bin = filepath.Join(dir, "baba")
	args := []string{"build", "-o", bin, "-ldflags", "-X main.version=1.2.3"}
	if coverDir != "" {
		args = append(args, "-cover", "-coverpkg=../../cmd/...,../../internal/...")
	}
	if out, err := exec.Command("go", append(args, "../../cmd/baba")...).CombinedOutput(); err != nil {
		panic(fmt.Sprintf("build: %v\n%s", err, out))
	}
	code := m.Run()
	os.RemoveAll(dir)
	os.Exit(code)
}

// discord is a fake webhook that records every message.
type discord struct {
	*httptest.Server
	mu       sync.Mutex
	messages []string
}

func newDiscord(t *testing.T) *discord {
	d := &discord{}
	d.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct{ Content string }
		_ = json.NewDecoder(r.Body).Decode(&body)
		d.mu.Lock()
		d.messages = append(d.messages, body.Content)
		d.mu.Unlock()
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(d.Close)
	return d
}

func (d *discord) received() string {
	d.mu.Lock()
	defer d.mu.Unlock()
	return strings.Join(d.messages, "\n")
}

// command runs baba with an isolated env: temp HOME, no BABA_* from the caller.
func command(t *testing.T, env []string, args ...string) *exec.Cmd {
	t.Helper()
	cmd := exec.Command(bin, args...)
	cmd.Env = append([]string{"PATH=" + os.Getenv("PATH"), "HOME=" + t.TempDir(), "GOCOVERDIR=" + coverDir}, env...)
	return cmd
}

// baba runs a command to completion and returns its combined output.
func baba(t *testing.T, env []string, stdin string, args ...string) (string, error) {
	t.Helper()
	cmd := command(t, env, args...)
	cmd.Stdin = strings.NewReader(stdin)
	out, err := cmd.CombinedOutput()
	return string(out), err
}
