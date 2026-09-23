// Package logs prints the service's JSON log file for humans.
package logs

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"slices"
	"strings"
	"time"
)

// Format turns a JSON log line into "2026-01-02 15:04:05.000 [INFO] message key=value"; other lines pass through.
// Numeric levels and millisecond times are pino's, from logs written by the TypeScript baba.
func Format(line string) string {
	var entry map[string]any
	if json.Unmarshal([]byte(line), &entry) != nil {
		return line
	}
	var t time.Time
	switch v := entry["time"].(type) {
	case string:
		t, _ = time.Parse(time.RFC3339Nano, v)
	case float64:
		t = time.UnixMilli(int64(v))
	}
	level := fmt.Sprint(entry["level"])
	if n, ok := entry["level"].(float64); ok {
		level = map[float64]string{10: "TRACE", 20: "DEBUG", 30: "INFO", 40: "WARN", 50: "ERROR", 60: "FATAL"}[n]
	}
	out := fmt.Sprintf("%s [%s] %v", t.UTC().Format("2006-01-02 15:04:05.000"), level, entry["msg"])

	var keys []string
	for k := range entry {
		if !slices.Contains([]string{"time", "level", "msg", "pid", "hostname"}, k) {
			keys = append(keys, k)
		}
	}
	slices.Sort(keys)
	for _, k := range keys {
		out += fmt.Sprintf(" %s=%v", k, entry[k])
	}
	return out
}

// Print writes the last n lines of path, then with follow polls it for new lines until killed.
func Print(w io.Writer, path string, n int, follow bool) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	lines := strings.FieldsFunc(string(data), func(r rune) bool { return r == '\n' })
	for _, line := range lines[max(0, len(lines)-n):] {
		fmt.Fprintln(w, Format(line))
	}
	if !follow {
		return nil
	}

	offset := int64(len(data))
	var partial []byte
	for {
		time.Sleep(200 * time.Millisecond)
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		if info, err := f.Stat(); err == nil && info.Size() < offset {
			offset = 0 // truncated or rotated
		}
		chunk, err := io.ReadAll(io.NewSectionReader(f, offset, 1<<62))
		f.Close()
		if err != nil {
			return err
		}
		offset += int64(len(chunk))
		partial = append(partial, chunk...)
		for {
			i := bytes.IndexByte(partial, '\n')
			if i < 0 {
				break
			}
			if line := string(partial[:i]); line != "" {
				fmt.Fprintln(w, Format(line))
			}
			partial = partial[i+1:]
		}
	}
}
