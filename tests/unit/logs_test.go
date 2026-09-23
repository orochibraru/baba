package unit

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/orochibraru/baba/internal/logs"
)

func TestFormat(t *testing.T) {
	for in, want := range map[string]string{
		`{"time":"2026-09-23T23:01:19.155+02:00","level":"INFO","msg":"alert","message":"disk full"}`: "2026-09-23 21:01:19.155 [INFO] alert message=disk full",
		`{"level":30,"time":1767312000000,"pid":1,"hostname":"x","msg":"Starting up..."}`:             "2026-01-02 00:00:00.000 [INFO] Starting up...",
		"plain text": "plain text",
	} {
		if got := logs.Format(in); got != want {
			t.Errorf("Format(%s) = %q, want %q", in, got, want)
		}
	}
}

func TestPrintTails(t *testing.T) {
	path := filepath.Join(t.TempDir(), "baba.log")
	_ = os.WriteFile(path, []byte("one\ntwo\nthree\n"), 0o644)
	var out bytes.Buffer
	if err := logs.Print(&out, path, 2, false); err != nil {
		t.Fatal(err)
	}
	if got := strings.TrimSpace(out.String()); got != "two\nthree" {
		t.Errorf("got %q", got)
	}
	if err := logs.Print(&out, path+".missing", 2, false); !os.IsNotExist(err) {
		t.Errorf("err = %v", err)
	}
}
