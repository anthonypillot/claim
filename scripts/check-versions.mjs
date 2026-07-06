import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import lockfile from "../bun.lock";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

const rootPackage = readJson("package.json");
const apiPackage = readJson("packages/api/package.json");
const webPackage = readJson("packages/web/package.json");
const expectedVersion = process.argv[2] ?? rootPackage.version;

if (!/^\d+\.\d+\.\d+$/.test(expectedVersion)) {
  throw new Error(`Expected a stable semantic version, received "${expectedVersion}"`);
}

const versions = {
  "package.json": rootPackage.version,
  "packages/api/package.json": apiPackage.version,
  "packages/web/package.json": webPackage.version,
  "bun.lock (packages/api)": lockfile.workspaces?.["packages/api"]?.version,
  "bun.lock (packages/web)": lockfile.workspaces?.["packages/web"]?.version,
};
const mismatches = Object.entries(versions).filter(([, version]) => version !== expectedVersion);

if (mismatches.length > 0) {
  const details = mismatches
    .map(([source, version]) => `${source}: ${JSON.stringify(version)}`)
    .join("\n");
  throw new Error(`Expected every package version to be ${expectedVersion}:\n${details}`);
}

console.log(`All package versions match ${expectedVersion}.`);
