import { logger } from "./src/lib/logger";

enum Architecture {
	X64 = "x64",
	ARM64 = "arm64",
	AARCH64 = "aarch64",
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

function buildTargets(): Bun.Build.CompileTarget[] {
	return [
		// Linux
		`bun-${Target.LINUX}-${Architecture.X64}`,
		`bun-${Target.LINUX}-${Architecture.ARM64}`,
		`bun-${Target.LINUX}-${Architecture.AARCH64}`,
		// MacOS
		`bun-${Target.MAC}-${Architecture.X64}`,
		`bun-${Target.MAC}-${Architecture.ARM64}`,
		`bun-${Target.MAC}-${Architecture.AARCH64}`,
		// Windows
		`bun-${Target.WIN}-${Architecture.AARCH64}`,
		`bun-${Target.WIN}-${Architecture.X64}`,
		`bun-${Target.WIN}-${Architecture.ARM64}`,
	];
}

async function main() {
	const errors: string[] = [];
	try {
		const targets = buildTargets();
		for (const target of targets) {
			logger.info(`Building ${target}...`);
			const res = await Bun.build({
				entrypoints: ["./src/index.ts"],
				compile: {
					target: target,
				},
				outdir: `dist/${target}`,
			});

			if (!res.success) {
				errors.push(`Failed to build ${target}`);
			}
		}
	} catch (e) {
		errors.push(`Failed to build package: ${JSON.stringify(e)}`);
	}

	if (errors.length > 0) {
		logger.error(`Build errors: ${JSON.stringify(errors)}`);
	}
}

void main();
