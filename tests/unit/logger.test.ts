import { describe, expect, test } from "bun:test";
import { createPinoLogger } from "../../src/lib/logger";

describe("createPinoLogger", () => {
	test("uses pino-pretty on a TTY", async () => {
		const original = process.stdout.isTTY;
		process.stdout.isTTY = true;
		try {
			const logger = await createPinoLogger();
			expect(logger.level).toBe("info");
		} finally {
			process.stdout.isTTY = original;
		}
	});

	test("logs plain JSON without a TTY", async () => {
		const original = process.stdout.isTTY;
		process.stdout.isTTY = false;
		try {
			const logger = await createPinoLogger();
			expect(logger.level).toBe("info");
		} finally {
			process.stdout.isTTY = original;
		}
	});
});
