import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readJson(path: string) {
  return JSON.parse(readFileSync(resolve(import.meta.dirname, "../../..", path), "utf8")) as Record<string, unknown>;
}

test("pnpm security settings are enabled", () => {
  const rootPackage = readJson("package.json");
  const workspace = readFileSync(resolve(import.meta.dirname, "../../..", "pnpm-workspace.yaml"), "utf8");

  assert.equal(rootPackage.packageManager, "pnpm@10.32.1");
  assert.match(workspace, /minimumReleaseAge:\s*1440/);
});

test("package manifests pin dependency versions exactly", () => {
  for (const manifestPath of ["apps/api/package.json", "packages/shared/package.json"]) {
    const manifest = readJson(manifestPath);
    for (const key of ["dependencies", "devDependencies"]) {
      const deps = (manifest[key] ?? {}) as Record<string, string>;
      for (const [name, version] of Object.entries(deps)) {
        if (version.startsWith("workspace:")) continue;
        assert.doesNotMatch(version, /^[~^]/, `${manifestPath} has an unpinned ${name}`);
      }
    }
  }
});
