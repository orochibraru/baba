import { z } from "zod";
import { ConfigSchema } from "../src/config";
import { ENV_VARS } from "../src/lib/env";
import { logger } from "../src/lib/logger";
import { discordNotifierSchema } from "../src/lib/notifiers/discord";
import { telegramNotifierSchema } from "../src/lib/notifiers/telegram";

logger.info("Generating docs...");

// ── helpers ───────────────────────────────────────────────────────────────────

function row(...cells: string[]): string {
	return `| ${cells.join(" | ")} |`;
}

function fence(s: string): string {
	return s ? `\`${s}\`` : "—";
}

// ── docs/env.md ───────────────────────────────────────────────────────────────

const envRows = Object.entries(ENV_VARS).map(([name, def]) =>
	row(
		`\`${name}\``,
		def.type,
		fence(def.default),
		def.example ? fence(def.example) : "—",
		def.description,
	),
);

const notifiersSectionEnv = `## Notifiers

Configure notifiers with individual environment variables — no JSON required. Each notifier type is independent; set whichever you need.

**Discord**

| Variable | Description | Example |
|----------|-------------|---------|
| \`BABA_NOTIFIERS_DISCORD_WEBHOOK_URL\` | Webhook URL. When set, replaces any Discord notifier from \`config.json\`. | \`https://discord.com/api/webhooks/<id>/<token>\` |

\`\`\`bash
BABA_NOTIFIERS_DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/<id>/<token>
\`\`\`

**Telegram** — both variables must be set together

| Variable | Description | Example |
|----------|-------------|---------|
| \`BABA_NOTIFIERS_TELEGRAM_BOT_TOKEN\` | Token from @BotFather on Telegram. | \`123456789:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\` |
| \`BABA_NOTIFIERS_TELEGRAM_CHAT_ID\` | Target chat, group ID (prefixed with \`-\`), or \`@channelname\`. | \`-1001234567890\` |

\`\`\`bash
BABA_NOTIFIERS_TELEGRAM_BOT_TOKEN=123456789:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
BABA_NOTIFIERS_TELEGRAM_CHAT_ID=-1001234567890
\`\`\`

**Both notifiers active at the same time**:

\`\`\`bash
BABA_NOTIFIERS_DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/<id>/<token>"
BABA_NOTIFIERS_TELEGRAM_BOT_TOKEN="123456789:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
BABA_NOTIFIERS_TELEGRAM_CHAT_ID="-1001234567890"
\`\`\`

Env var notifiers override any notifier of the same type from \`config.json\` while leaving other types in place. If only one of the Telegram pair is set, both are ignored with a warning.
`;

const envMd = `# Environment Variables

Every setting in \`config.json\` can be overridden with an environment variable.
Values are applied **before** Zod validation, so type coercion and defaults still apply.

| Variable | Type | Default | Example | Description |
|----------|------|---------|---------|-------------|
${envRows.join("\n")}

${notifiersSectionEnv}
## Types

| Type | Parsing |
|------|---------|
| \`string\` | Passed through as-is |
| \`number\` | Parsed with \`Number()\` |
| \`boolean\` | \`"true"\` or \`"1"\` → \`true\`; anything else → \`false\` |
| \`csv\` | Split on \`,\`, trimmed, empty strings removed |
| \`json\` | Parsed with \`JSON.parse()\` — must be valid JSON |
`;

// ── docs/config.md ────────────────────────────────────────────────────────────

type JsonSchema = {
	type?: string | string[];
	properties?: Record<string, JsonSchema>;
	items?: JsonSchema;
	default?: unknown;
	enum?: unknown[];
	const?: unknown;
	description?: string;
	anyOf?: JsonSchema[];
	oneOf?: JsonSchema[];
	$ref?: string;
};

function schemaType(s: JsonSchema): string {
	if (s.const !== undefined) return fence(String(s.const));
	if (s.enum) return s.enum.map((v) => `\`${v}\``).join(" \\| ");
	if (s.anyOf) return s.anyOf.map(schemaType).join(" \\| ");
	if (s.oneOf) return s.oneOf.map(schemaType).join(" \\| ");
	if (Array.isArray(s.type)) return s.type.join(" \\| ");
	if (s.type === "array" && s.items) return `${schemaType(s.items)}[]`;
	return s.type ?? "any";
}

function schemaDefault(s: JsonSchema): string {
	if (s.default === undefined) return "—";
	const v = s.default;
	if (typeof v === "object") return fence(JSON.stringify(v));
	return fence(String(v));
}

// Build a path → description map from ENV_VARS so config table rows get descriptions.
const envDesc = new Map<string, string>(
	Object.values(ENV_VARS).map((def) => [def.path.join("."), def.description]),
);

function flattenProperties(
	props: Record<string, JsonSchema>,
	prefix = "",
): string[] {
	const lines: string[] = [];
	for (const [key, schema] of Object.entries(props)) {
		const path = prefix ? `${prefix}.${key}` : key;

		// notifiers is a discriminated union array — render a single summary row
		// and let the Notifiers section below the table document the fields.
		if (path === "notifiers") {
			lines.push(
				row(
					`\`${path}\``,
					"NotifierConfig[]",
					"**required**",
					"One or more notification destinations. See [Notifiers](#notifiers) below.",
				),
			);
			continue;
		}

		if (schema.properties) {
			lines.push(...flattenProperties(schema.properties, path));
		} else {
			const desc = schema.description ?? envDesc.get(path) ?? "—";
			lines.push(
				row(`\`${path}\``, schemaType(schema), schemaDefault(schema), desc),
			);
		}
	}
	return lines;
}

// Generate a field table for a single notifier schema.
function notifierFieldTable(schema: z.ZodType): string {
	const js = z.toJSONSchema(schema, {
		target: "draft-7",
		unrepresentable: "any",
	}) as JsonSchema;
	if (!js.properties) return "";
	const rows = Object.entries(js.properties).map(([field, fieldSchema]) => {
		const s = fieldSchema as JsonSchema;
		return row(`\`${field}\``, schemaType(s), s.description ?? "—");
	});
	return [
		"| Field | Type | Description |",
		"|-------|------|-------------|",
		...rows,
	].join("\n");
}

const notifiersSectionConfig = `## Notifiers

\`notifiers\` is a required array. Each entry must have a \`"type"\` field that selects the notifier. You can list multiple destinations of different types.

### Discord

Sends alerts to a Discord channel via an incoming webhook.

${notifierFieldTable(discordNotifierSchema)}

\`\`\`json
{
  "type": "discord",
  "webhookUrl": "https://discord.com/api/webhooks/<id>/<token>"
}
\`\`\`

### Telegram

Sends alerts to a Telegram chat, group, or channel via a bot.

${notifierFieldTable(telegramNotifierSchema)}

\`\`\`json
{
  "type": "telegram",
  "botToken": "123456789:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "chatId": "-1001234567890"
}
\`\`\`

To find your Telegram chat ID: add [@userinfobot](https://t.me/userinfobot) to the chat, or forward a message from the chat to it.
`;

const jsonSchema = z.toJSONSchema(ConfigSchema, {
	target: "draft-7",
	unrepresentable: "any",
}) as JsonSchema;

// machineName defaults to os.hostname() at runtime — strip the machine-specific
// value so generated docs don't change on every developer's machine.
if (jsonSchema.properties?.machineName) {
	delete jsonSchema.properties.machineName.default;
}

const configRows = jsonSchema.properties
	? flattenProperties(jsonSchema.properties)
	: [];

const configMd = `# Configuration Reference

All settings below can be placed in \`config.json\` at the project root.
Unknown fields are **rejected** — use the exact key names shown.
Every field is optional (defaults are applied) except \`notifiers\`.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
${configRows.join("\n")}

${notifiersSectionConfig}
## Minimal \`config.json\`

\`\`\`json
{
  "$schema": "./schema/config.schema.json",
  "notifiers": [
    { "type": "discord", "webhookUrl": "https://discord.com/api/webhooks/<id>/<token>" }
  ]
}
\`\`\`

## Full example with all fields

See \`config.example.json\` in the repository root.
`;

// ── config.example.json ───────────────────────────────────────────────────────

const exampleConfig = ConfigSchema.parse({
	$schema: "./schema/config.schema.json",
	machineName: "my-server",
	notifiers: [
		{
			type: "discord",
			webhookUrl: "https://discord.com/api/webhooks/<id>/<token>",
		},
		{
			type: "telegram",
			botToken: "123456789:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
			chatId: "-1001234567890",
		},
	],
});

// ── write ─────────────────────────────────────────────────────────────────────

await Bun.write("docs/env.md", envMd);
await Bun.write("docs/config.md", configMd);
await Bun.write(
	"config.example.json",
	`${JSON.stringify(exampleConfig, null, "\t")}\n`,
);
logger.info("Generated docs/env.md, docs/config.md, and config.example.json");
