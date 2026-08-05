import packagejson from "../../../package.json";

export function printVersion(): void {
	process.stdout.write(`${packagejson.version}\n`);
}
