import { describe, expect, test } from "bun:test";
import { humanReadableBytes } from "../../src/lib/helpers";

describe("humanReadableBytes", () => {
	test("0 bytes", () => {
		expect(humanReadableBytes(0)).toBe("0.00 B");
	});

	test("bytes under 1 KB", () => {
		expect(humanReadableBytes(512)).toBe("512.00 B");
	});

	test("exactly 1 KB", () => {
		expect(humanReadableBytes(1024)).toBe("1.00 KB");
	});

	test("exactly 1 MB", () => {
		expect(humanReadableBytes(1024 ** 2)).toBe("1.00 MB");
	});

	test("exactly 1 GB", () => {
		expect(humanReadableBytes(1024 ** 3)).toBe("1.00 GB");
	});

	test("exactly 1 TB", () => {
		expect(humanReadableBytes(1024 ** 4)).toBe("1.00 TB");
	});

	test("fractional value (1.5 KB)", () => {
		expect(humanReadableBytes(1536)).toBe("1.50 KB");
	});

	test("fractional value (2.25 GB)", () => {
		expect(humanReadableBytes(2.25 * 1024 ** 3)).toBe("2.25 GB");
	});
});
