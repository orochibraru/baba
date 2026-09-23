package unit

import (
	"bytes"
	"compress/gzip"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/orochibraru/baba/internal/update"
)

func TestIsNewer(t *testing.T) {
	for _, c := range []struct {
		latest, current string
		want            bool
	}{
		{"1.0.20", "1.0.19", true},
		{"1.1.0", "1.0.19", true},
		{"2.0.0", "1.9.9", true},
		{"1.0.19", "1.0.19", false},
		{"1.0.19", "1.0.20", false},
		{"1.0.10", "1.0.9", true}, // numeric, not lexical
		{"1.0.20", "1.0.20-canary.3", true},
		{"1.0.19", "1.0.20-canary.3", false},
		{"1.0.20", "dev", false},
		{"garbage", "1.0.0", false},
	} {
		if got := update.IsNewer(c.latest, c.current); got != c.want {
			t.Errorf("IsNewer(%q, %q) = %v", c.latest, c.current, got)
		}
	}
}

func TestLatestAndApply(t *testing.T) {
	var gz bytes.Buffer
	w := gzip.NewWriter(&gz)
	_, _ = w.Write([]byte("new binary"))
	_ = w.Close()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/latest":
			_, _ = w.Write([]byte(`{"tag_name": "v1.2.3"}`))
		case "/download/v1.2.3/" + update.Asset() + ".gz":
			_, _ = w.Write(gz.Bytes())
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	update.Repo.API, update.Repo.Download = server.URL+"/latest", server.URL+"/download"

	latest, err := update.Latest()
	if err != nil || latest != "1.2.3" {
		t.Fatalf("Latest = %q, %v", latest, err)
	}
	dest := filepath.Join(t.TempDir(), "baba")
	_ = os.WriteFile(dest, []byte("old"), 0o755)
	if err := update.Apply(latest, dest); err != nil {
		t.Fatal(err)
	}
	if got, _ := os.ReadFile(dest); string(got) != "new binary" {
		t.Errorf("binary = %q", got)
	}
	if info, _ := os.Stat(dest); info.Mode().Perm() != 0o755 {
		t.Errorf("mode = %v", info.Mode())
	}
	if err := update.Apply("9.9.9", dest); err == nil {
		t.Error("no error on a missing release")
	}
	update.Repo.API = server.URL + "/missing"
	if _, err := update.Latest(); err == nil {
		t.Error("no error on a missing API")
	}
}
