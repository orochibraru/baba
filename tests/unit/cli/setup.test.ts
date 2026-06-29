import { describe, expect, test } from "bun:test";
import type { SetupDeps } from "../../../src/lib/cli/setup";
import { setup } from "../../../src/lib/cli/setup";

interface MakeVolumeProps {
	fs: string;
	size: number;
	mount: string;
}
const makeVolume = ({ fs, size, mount }: MakeVolumeProps) => ({
	fs,
	used: Math.trunc(size * 0.5),
	available: Math.trunc(size * 0.5),
	size,
	use: 50,
	mount,
});

describe("setup", () => {
	test("calls exit(0) when no volumes found", async () => {
		let exitCode: number | undefined;
		const deps: SetupDeps = {
			fsSize: async () => [],
			exit: (code) => {
				exitCode = code;
			},
		};
		await setup(deps);
		expect(exitCode).toBe(0);
	});

	test("logs root volume for a single volume", async () => {
		let exitCode: number | undefined;
		const deps: SetupDeps = {
			fsSize: async () => [
				makeVolume({ fs: "/dev/sda1", size: 1_000_000_000_000, mount: "/" }),
			],
			exit: (code) => {
				exitCode = code;
			},
		};
		await setup(deps);
		expect(exitCode).toBeUndefined();
	});

	test("sorts volumes by size and picks the largest as root", async () => {
		let exitCode: number | undefined;
		const deps: SetupDeps = {
			fsSize: async () => [
				makeVolume({ fs: "/dev/sdb1", size: 100_000_000_000, mount: "/data" }),
				makeVolume({ fs: "/dev/sda1", size: 500_000_000_000, mount: "/" }),
			],
			exit: (code) => {
				exitCode = code;
			},
		};
		await setup(deps);
		expect(exitCode).toBeUndefined();
	});

	test("lists additional volumes beyond the root", async () => {
		let exitCode: number | undefined;
		const deps: SetupDeps = {
			fsSize: async () => [
				makeVolume({ fs: "/dev/sda1", size: 500_000_000_000, mount: "/" }),
				makeVolume({ fs: "/dev/sdb1", size: 200_000_000_000, mount: "/data" }),
				makeVolume({
					fs: "/dev/sdc1",
					size: 100_000_000_000,
					mount: "/backup",
				}),
			],
			exit: (code) => {
				exitCode = code;
			},
		};
		await setup(deps);
		expect(exitCode).toBeUndefined();
	});
});
