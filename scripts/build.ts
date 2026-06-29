import { mkdirSync, renameSync, rmSync } from "node:fs";
import { logger } from "../src/lib/logger";

enum Architecture {
	X64 = "x64",
	ARM64 = "arm64",
}

enum Target {
	WIN = "windows",
	LINUX = "linux",
	MAC = "darwin",
}

// Compile targets:
// namespace Build {
//   type Architecture = "x64" | "arm64" | "aarch64";
//   type Libc = "glibc" | "musl";
//   type SIMD = "baseline" | "modern";
//   type CompileTarget =
//     | `bun-darwin-${Architecture}`
//     | `bun-darwin-${Architecture}-${SIMD}`
//     | `bun-linux-${Architecture}`
//     | `bun-linux-${Architecture}-${Libc}`
//     | `bun-linux-${Architecture}-${SIMD}`
//     | `bun-linux-${Architecture}-${SIMD}-${Libc}`
//     | `bun-windows-${Architecture}`
//     | `bun-windows-x64-${SIMD}`;
// }

export type BuildDeps = {
	build: typeof Bun.build;
	mkdirSync: typeof mkdirSync;
	renameSync: typeof renameSync;
	rmSync: typeof rmSync;
};

const defaultDeps: BuildDeps = {
	build: Bun.build,
	mkdirSync,
	renameSync,
	rmSync,
};

export function buildTargets(): Bun.Build.CompileTarget[] {
	return [
		// Linux
		`bun-${Target.LINUX}-${Architecture.X64}`,
		`bun-${Target.LINUX}-${Architecture.ARM64}`,
		// macOS
		`bun-${Target.MAC}-${Architecture.X64}`,
		`bun-${Target.MAC}-${Architecture.ARM64}`,
		// Windows
		`bun-${Target.WIN}-${Architecture.X64}`,
		`bun-${Target.WIN}-${Architecture.ARM64}`,
	];
}

// Returns null on success, or an error message on failure.
export async function buildForTarget(
	target: Bun.Build.CompileTarget,
	deps: BuildDeps = defaultDeps,
): Promise<string | null> {
	const tmpDir = `dist/.tmp-${target}`;
	try {
		deps.mkdirSync(tmpDir, { recursive: true });
		const res = await deps.build({
			entrypoints: ["./src/index.ts"],
			compile: { target },
			outdir: tmpDir,
		});
		if (!res.success) return `Failed to build ${target}`;
		const out = res.outputs[0];
		if (!out) return `No output produced for ${target}`;
		const ext = target.includes("windows") ? ".exe" : "";
		deps.renameSync(out.path, `dist/${target}${ext}`);
		return null;
	} catch (e) {
		return `Failed to build ${target}: ${e}`;
	} finally {
		deps.rmSync(tmpDir, { recursive: true, force: true });
	}
}

export async function main(deps: BuildDeps = defaultDeps): Promise<void> {
	deps.mkdirSync("dist", { recursive: true });
	const errors: string[] = [];
	for (const target of buildTargets()) {
		logger.info(`Building ${target}...`);
		const error = await buildForTarget(target, deps);
		if (error) errors.push(error);
	}
	if (errors.length > 0) {
		for (const err of errors) logger.error(err);
		process.exit(1);
	}
	logger.info("Build complete.");
}

/* c8 ignore next */
if (import.meta.main) void main();
