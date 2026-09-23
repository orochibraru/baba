// Package update finds the latest GitHub release and swaps the running binary for it.
package update

import (
	"compress/gzip"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// Repo is the GitHub API and download base; tests point it at a fake server.
var Repo = struct{ API, Download string }{
	API:      "https://api.github.com/repos/orochibraru/baba/releases/latest",
	Download: "https://github.com/orochibraru/baba/releases/download",
}

var client = &http.Client{Timeout: 2 * time.Minute}

// Latest returns the latest stable release's version, without the "v".
func Latest() (string, error) {
	res, err := client.Get(Repo.API)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GitHub releases: HTTP %d", res.StatusCode)
	}
	var release struct {
		TagName string `json:"tag_name"`
	}
	if err := json.NewDecoder(res.Body).Decode(&release); err != nil {
		return "", err
	}
	if release.TagName == "" {
		return "", errors.New("GitHub releases: no tag_name")
	}
	return strings.TrimPrefix(release.TagName, "v"), nil
}

// IsNewer compares X.Y.Z versions; a stable release is newer than its own prerelease (1.2.0 > 1.2.0-canary.3).
// An unparsable current version (a "dev" build) is never outdated.
func IsNewer(latest, current string) bool {
	parse := func(v string) (core [3]int, pre bool, ok bool) {
		v, suffix, pre := strings.Cut(strings.TrimPrefix(v, "v"), "-")
		parts := strings.Split(v, ".")
		if len(parts) != 3 {
			return core, pre, false
		}
		for i, p := range parts {
			n, err := strconv.Atoi(p)
			if err != nil {
				return core, pre, false
			}
			core[i] = n
		}
		return core, pre && suffix != "", true
	}
	l, latestPre, okLatest := parse(latest)
	c, currentPre, okCurrent := parse(current)
	if !okLatest || !okCurrent {
		return false
	}
	for i := range l {
		if l[i] != c[i] {
			return l[i] > c[i]
		}
	}
	return currentPre && !latestPre
}

// Asset is the release asset for this platform; the names date from the Bun builds (x64, not amd64).
func Asset() string {
	arch := runtime.GOARCH
	if arch == "amd64" {
		arch = "x64"
	}
	return "baba-" + runtime.GOOS + "-" + arch
}

// Apply downloads version and replaces the binary at dest, through sudo when its directory isn't writable.
func Apply(version, dest string) error {
	res, err := client.Get(fmt.Sprintf("%s/v%s/%s.gz", Repo.Download, version, Asset()))
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed: HTTP %d", res.StatusCode)
	}
	binary, err := gzip.NewReader(res.Body)
	if err != nil {
		return fmt.Errorf("decompress: %w", err)
	}

	tmp, err := os.CreateTemp(filepath.Dir(dest), ".baba-update-*")
	sameDir := err == nil
	if !sameDir {
		if tmp, err = os.CreateTemp("", "baba-update-*"); err != nil {
			return err
		}
	}
	defer os.Remove(tmp.Name())
	if _, err := io.Copy(tmp, binary); err != nil {
		tmp.Close()
		return fmt.Errorf("decompress: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmp.Name(), 0o755); err != nil {
		return err
	}
	if sameDir {
		return os.Rename(tmp.Name(), dest)
	}
	cmd := exec.Command("sudo", "mv", tmp.Name(), dest)
	cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("replace %s: %w", dest, err)
	}
	return nil
}
