package unit

import (
	"encoding/json"
	"os"
	"slices"
	"testing"

	"github.com/orochibraru/baba/internal/config"
)

// schema/config.schema.json is written by hand: every key it declares must exist in Config, and the reverse.
func TestSchemaMatchesConfig(t *testing.T) {
	data, err := os.ReadFile("../../schema/config.schema.json")
	if err != nil {
		t.Fatal(err)
	}
	var schema map[string]any
	if err := json.Unmarshal(data, &schema); err != nil {
		t.Fatal(err)
	}
	c := config.Defaults()
	c.Schema = config.SchemaURL
	c.Notifiers = []config.Notifier{{Type: "discord", WebhookURL: "x", BotToken: "x", ChatID: "x"}}
	encoded, _ := json.Marshal(c)
	var fields map[string]any
	_ = json.Unmarshal(encoded, &fields)

	var keys func(node map[string]any, prefix string) []string
	keys = func(node map[string]any, prefix string) []string {
		var list []string
		if items, ok := node["items"].(map[string]any); ok {
			node = items
		}
		for _, variant := range append([]any{node}, anyList(node["oneOf"], node["anyOf"])...) {
			properties, _ := variant.(map[string]any)["properties"].(map[string]any)
			for name, child := range properties {
				list = append(list, prefix+name)
				list = append(list, keys(child.(map[string]any), prefix+name+".")...)
			}
		}
		return list
	}
	var paths func(value any, prefix string) []string
	paths = func(value any, prefix string) []string {
		var list []string
		switch v := value.(type) {
		case map[string]any:
			for name, child := range v {
				list = append(list, prefix+name)
				list = append(list, paths(child, prefix+name+".")...)
			}
		case []any:
			for _, item := range v {
				list = append(list, paths(item, prefix)...)
			}
		}
		return list
	}

	schemaKeys, configKeys := keys(schema, ""), paths(fields, "")
	slices.Sort(schemaKeys)
	slices.Sort(configKeys)
	schemaKeys, configKeys = slices.Compact(schemaKeys), slices.Compact(configKeys)
	for _, k := range schemaKeys {
		if !slices.Contains(configKeys, k) {
			t.Errorf("schema declares %q, Config doesn't", k)
		}
	}
	for _, k := range configKeys {
		if !slices.Contains(schemaKeys, k) {
			t.Errorf("Config has %q, the schema doesn't", k)
		}
	}
}

func anyList(values ...any) []any {
	var list []any
	for _, v := range values {
		items, _ := v.([]any)
		list = append(list, items...)
	}
	return list
}
