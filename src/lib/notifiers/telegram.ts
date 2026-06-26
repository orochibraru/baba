import { z } from "zod";
import { AbstractNotifier } from "./abstract-notifier";

export const telegramNotifierSchema = z
	.object({
		type: z.literal("telegram", { error: "Must be 'telegram'" }),
		botToken: z
			.string({ error: "Must be a string" })
			.min(
				1,
				"Bot token cannot be empty — get one from @BotFather on Telegram",
			),
		chatId: z
			.string({ error: "Must be a string" })
			.min(
				1,
				"Chat ID cannot be empty — use a user ID, group ID (prefixed with -), or @channelname",
			),
	})
	.strict();

export type TelegramNotifierConfig = z.infer<typeof telegramNotifierSchema>;

export type TelegramNotifierProps = {
	botToken: string;
	chatId: string;
};

export class TelegramNotifier extends AbstractNotifier {
	private botToken: string;
	private chatId: string;

	constructor(props: TelegramNotifierProps) {
		super({ validationMessage: "Validation message for Telegram" });
		this.botToken = props.botToken;
		this.chatId = props.chatId;
	}

	async sendAlert(message: string): Promise<void> {
		try {
			const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
			const res = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ chat_id: this.chatId, text: message }),
			});
			if (!res.ok) {
				const body = (await res.json()) as { description?: string };
				console.error(
					`Telegram API returned ${res.status}: ${body.description ?? res.statusText}`,
				);
			}
		} catch (error) {
			console.error("Failed to send alert to Telegram:", error);
		}
	}
}
