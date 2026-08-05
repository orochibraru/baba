import { describe, expect, test } from "bun:test";
import packagejson from "../../../package.json";
import { printVersion } from "../../../src/lib/cli/version";

describe("printVersion", () => {
	test("writes the package version to stdout", () => {
		const written: string[] = [];
		const orig = process.stdout.write.bind(process.stdout);
		process.stdout.write = ((s: string) => {
			written.push(s);
			return true;
		}) as never;
		try {
			printVersion();
		} finally {
			process.stdout.write = orig;
		}
		expect(written.join("")).toBe(`${packagejson.version}\n`);
	});
});
