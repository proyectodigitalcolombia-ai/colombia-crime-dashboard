import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packageJsonPath = resolve(root, "package.json");
const renderYamlPath = resolve(root, "render.yaml");

function fail(message) {
  console.error(`pnpm version check failed: ${message}`);
  process.exit(1);
}

let packageJson;
try {
  packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
} catch (error) {
  fail(`could not read ${packageJsonPath}: ${error.message}`);
}

const packageManager = packageJson.packageManager;
const packageManagerMatch =
  typeof packageManager === "string" && /^pnpm@([^+\s]+)$/.exec(packageManager);

if (!packageManagerMatch) {
  fail(
    `package.json must declare an exact pnpm version in packageManager (found ${JSON.stringify(packageManager)})`,
  );
}

let renderYaml;
try {
  renderYaml = readFileSync(renderYamlPath, "utf8");
} catch (error) {
  fail(`could not read ${renderYamlPath}: ${error.message}`);
}

const renderVersions = [
  ...renderYaml.matchAll(/(?:^|\s)pnpm@([0-9][^"';&|\s]*)/gm),
].map((match) => match[1]);

if (renderVersions.length === 0) {
  fail(
    "render.yaml does not declare a pnpm version in a build command; add pnpm@<version> and keep it aligned with package.json",
  );
}

const expectedVersion = packageManagerMatch[1];
const mismatchedVersions = renderVersions.filter(
  (version) => version !== expectedVersion,
);

if (mismatchedVersions.length > 0) {
  const declaredVersions = [...new Set(renderVersions)].join(", ");
  fail(
    `version mismatch: package.json declares pnpm@${expectedVersion}, but render.yaml declares pnpm@${declaredVersions}. Update both declarations so they match before deploying.`,
  );
}

console.log(
  `pnpm version aligned: package.json and render.yaml both use pnpm@${expectedVersion}.`,
);