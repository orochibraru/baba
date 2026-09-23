import { describe, expect, test } from "bun:test";
import { defaultExec } from "../../../src/lib/cli/exec";

describe("defaultExec", () => {
	test("returns ok with stdout and stderr combined", async () => {
		const res = await defaultExec(["sh", "-c", "echo out; echo err >&2"]);
		expect(res.ok).toBe(true);
		expect(res.out).toContain("out");
		expect(res.out).toContain("err");
	});

	test("is not ok on a non-zero exit", async () => {
		const res = await defaultExec(["sh", "-c", "exit 3"]);
		expect(res.ok).toBe(false);
	});

	test("is not ok when the binary does not exist", async () => {
		const res = await defaultExec(["/nonexistent/baba-test-binary"]);
		expect(res.ok).toBe(false);
		expect(res.out).not.toBe("");
	});
});
