# Notifiers

`notifiers` in `config.json` is the only required setting: a list of places to
send alerts. List several, of either type; every alert goes to all of them.

```json
{
  "notifiers": [
    {
      "type": "discord",
      "webhookUrl": "https://discord.com/api/webhooks/<id>/<token>"
    },
    {
      "type": "telegram",
      "botToken": "123456789:AAF…",
      "chatId": "-1001234567890"
    }
  ]
}
```

Test them with `baba validate`: it sends "This is a test alert." to each and
fails, naming the notifier, if one doesn't accept it.

## Discord

Posts to a channel through an incoming webhook, as the user "Baba". Create one
in Discord: Channel Settings → Integrations → Webhooks → New Webhook → Copy
Webhook URL.

| Field        | Type      | Description                                 |
| ------------ | --------- | ------------------------------------------- |
| `type`       | `discord` |                                             |
| `webhookUrl` | string    | The webhook URL, `https://…` (or `http://`) |

Alerts use Discord Markdown: the value is in bold.

## Telegram

Sends through a bot's `sendMessage`.

1. Talk to [@BotFather](https://t.me/BotFather), send `/newbot`, and keep the
   token it gives you.
2. Add the bot to your chat, group or channel (as an admin, for a channel).
3. Find the chat ID: add [@userinfobot](https://t.me/userinfobot) to the chat,
   or forward a message from it to that bot.

| Field      | Type       | Description                                                  |
| ---------- | ---------- | ------------------------------------------------------------ |
| `type`     | `telegram` |                                                              |
| `botToken` | string     | Token from @BotFather                                        |
| `chatId`   | string     | A user ID, a group ID (prefixed with `-`), or `@channelname` |

Messages go out as plain text, so the `**` around values show as-is.

## From environment variables

`BABA_NOTIFIERS_DISCORD_WEBHOOK_URL`, and the pair
`BABA_NOTIFIERS_TELEGRAM_BOT_TOKEN` + `BABA_NOTIFIERS_TELEGRAM_CHAT_ID`, add a
notifier or replace the one of the same type from `config.json`. See
[Environment variables](env.md#notifiers).

## When a notifier fails

Each request has a 15 second timeout. A failure (network error, or an HTTP
status of 300 or more) is logged with the response, the other notifiers still
get the alert, and the incident records the notification as failed (`✗` in
`baba get incident`). There is no retry: the next reminder is the retry. Error
messages leave out the request URL, so the Telegram token never reaches the
logs.
