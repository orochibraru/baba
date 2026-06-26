import { z } from "zod";
import { ConfigSchema } from "../src/config";
import { logger } from "../src/lib/logger";

logger.info;

const schema = z.toJSONSchema(ConfigSchema, {
	target: "draft-7",
	unrepresentable: "any",
});

await Bun.write(
	"./schema/config.schema.json",
	`${JSON.stringify(schema, null, 2)}\n`,
);
logger.info("Generated config.schema.json");
