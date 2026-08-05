// Shared subprocess-exec helper for CLI commands that shell out to
// launchctl/systemctl/sudo (install, restart, uninstall).

export type ExecResult = { ok: boolean; out: string };
export type ExecFn = (cmd: string[]) => Promise<ExecResult>;

export const defaultExec: ExecFn = async (cmd) => {
	try {
		const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
		const [stdout, stderr, exit] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		return { ok: exit === 0, out: (stdout + stderr).trim() };
	} catch (err) {
		return { ok: false, out: String(err) };
	}
};
