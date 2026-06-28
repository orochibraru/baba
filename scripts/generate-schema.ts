import { z } from "zod";
import { ConfigSchema } from "../src/config";
import { logger } from "../src/lib/logger";

logger.info;

const schema = z.toJSONSchema(ConfigSchema, {
	target: "draft-7",
	unrepresentable: "any",
}) as { properties?: Record<string, Record<string, unknown>> };

// machineName defaults to os.hostname() at runtime — strip the machine-specific value
// from the committed schema so it doesn't change on every developer's machine.
if (schema.properties?.machineName) {
	delete schema.properties.machineName.default;
}

await Bun.write(
	"./schema/config.schema.json",
	`${JSON.stringify(schema, null, 2)}\n`,
);
logger.info("Generated config.schema.json");
