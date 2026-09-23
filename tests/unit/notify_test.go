package unit

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/orochibraru/baba/internal/config"
	"github.com/orochibraru/baba/internal/notify"
)

func TestAlert(t *testing.T) {
	var got []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]string
		_ = json.NewDecoder(r.Body).Decode(&body)
		got = append(got, r.URL.Path+" "+body["content"]+body["text"]+" "+body["chat_id"]+body["username"])
		if strings.Contains(r.URL.Path, "broken") {
			http.Error(w, "nope", http.StatusBadRequest)
		}
	}))
	defer server.Close()
	notify.TelegramAPI = server.URL

	err := notify.Alert([]config.Notifier{
		{Type: "discord", WebhookURL: server.URL + "/broken"},
		{Type: "telegram", BotToken: "secret", ChatID: "-100"},
		{Type: "discord", WebhookURL: "http://127.0.0.1:1/unreachable"},
	}, "disk full")

	want := []string{"/broken disk full Baba", "/botsecret/sendMessage disk full -100"}
	if strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Errorf("requests:\n%s", strings.Join(got, "\n"))
	}
	if err == nil || !strings.Contains(err.Error(), "HTTP 400: nope") || !strings.Contains(err.Error(), "connection refused") {
		t.Errorf("err = %v", err)
	}
	if strings.Contains(err.Error(), "127.0.0.1:1/unreachable") {
		t.Errorf("error leaks the URL: %v", err)
	}
}
