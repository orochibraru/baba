package unit

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// docs/config.json drives the docs site: every guide is listed once, every listed slug is a guide.
func TestDocsConfigListsEveryGuide(t *testing.T) {
	data, err := os.ReadFile("../../docs/config.json")
	if err != nil {
		t.Fatal(err)
	}
	var site struct {
		Categories []struct {
			Pages []struct{ Slug string }
		}
	}
	if err := json.Unmarshal(data, &site); err != nil {
		t.Fatal(err)
	}
	var listed []string
	for _, category := range site.Categories {
		for _, page := range category.Pages {
			if slices.Contains(listed, page.Slug) {
				t.Errorf("%s listed twice", page.Slug)
			}
			listed = append(listed, page.Slug)
		}
	}
	files, _ := filepath.Glob("../../docs/*.md")
	var guides []string
	for _, f := range files {
		if slug := strings.TrimSuffix(filepath.Base(f), ".md"); slug != "README" {
			guides = append(guides, slug)
		}
	}
	for _, slug := range listed {
		if !slices.Contains(guides, slug) {
			t.Errorf("docs/config.json lists %q, there's no docs/%s.md", slug, slug)
		}
	}
	for _, slug := range guides {
		if !slices.Contains(listed, slug) {
			t.Errorf("docs/%s.md is missing from docs/config.json", slug)
		}
	}
	index, _ := os.ReadFile("../../docs/README.md")
	for _, slug := range guides {
		if !strings.Contains(string(index), "("+slug+".md)") {
			t.Errorf("docs/README.md doesn't link %s.md", slug)
		}
	}
}
