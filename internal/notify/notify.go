// Package notify posts alerts to Discord webhooks and Telegram bots.
package notify

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"time"

	"github.com/orochibraru/baba/internal/config"
)

// TelegramAPI is the Bot API base URL; tests point it at a fake server.
var TelegramAPI = "https://api.telegram.org"

var client = &http.Client{Timeout: 15 * time.Second}

// Alert sends message to every notifier, even after one fails; the error joins every failure.
func Alert(notifiers []config.Notifier, message string) error {
	slog.Info("alert", "message", message)
	var errs []error
	for _, n := range notifiers {
		var err error
		switch n.Type {
		case "discord":
			err = post(n.WebhookURL, map[string]string{"content": message, "username": "Baba"})
		case "telegram":
			err = post(TelegramAPI+"/bot"+n.BotToken+"/sendMessage", map[string]string{"chat_id": n.ChatID, "text": message})
		}
		if err != nil {
			slog.Error("notifier failed", "type", n.Type, "error", err)
			errs = append(errs, fmt.Errorf("%s: %w", n.Type, err))
		}
	}
	return errors.Join(errs...)
}

func post(endpoint string, payload any) error {
	body, _ := json.Marshal(payload)
	res, err := client.Post(endpoint, "application/json", bytes.NewReader(body))
	if err != nil {
		var urlErr *url.Error
		if errors.As(err, &urlErr) { // its message repeats the URL, which holds the Telegram token
			err = urlErr.Err
		}
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		detail, _ := io.ReadAll(io.LimitReader(res.Body, 512))
		return fmt.Errorf("HTTP %d: %s", res.StatusCode, bytes.TrimSpace(detail))
	}
	return nil
}
