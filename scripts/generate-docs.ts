import { z } from "zod";
import { ConfigSchema } from "../src/config";
import { ENV_VARS } from "../src/lib/env";
import { logger } from "../src/lib/logger";

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

const envMd = `# Environment Variables

Every setting in \`config.json\` can be overridden with an environment variable.
Values are applied **before** Zod validation, so type coercion and defaults still apply.

| Variable | Type | Default | Example | Description |
|----------|------|---------|---------|-------------|
${envRows.join("\n")}

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
	description?: string;
	anyOf?: JsonSchema[];
	oneOf?: JsonSchema[];
	$ref?: string;
};

function schemaType(s: JsonSchema): string {
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

function flattenProperties(
	props: Record<string, JsonSchema>,
	prefix = "",
): string[] {
	const lines: string[] = [];
	for (const [key, schema] of Object.entries(props)) {
		const path = prefix ? `${prefix}.${key}` : key;
		if (schema.properties) {
			lines.push(...flattenProperties(schema.properties, path));
		} else {
			lines.push(
				row(
					`\`${path}\``,
					schemaType(schema),
					schemaDefault(schema),
					schema.description ?? "—",
				),
			);
		}
	}
	return lines;
}

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

## Minimal \`config.json\`

\`\`\`json
{
  "$schema": "./schema/config.schema.json",
  "notifiers": [
    { "type": "discord", "webhookUrl": "https://discord.com/api/webhooks/…" }
  ]
}
\`\`\`

## Full example with all fields

See \`config.example.json\` in the repository root.
`;

// ── write ─────────────────────────────────────────────────────────────────────

await Bun.write("docs/env.md", envMd);
await Bun.write("docs/config.md", configMd);
logger.info("Generated docs/env.md and docs/config.md");
