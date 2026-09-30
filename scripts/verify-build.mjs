import { readFile, access } from "node:fs/promises";
import assert from "node:assert/strict";
const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));
assert.equal(manifest.manifest_version, 3);
assert.equal(
  manifest.commands["toggle-overlay"].suggested_key.mac,
  "Command+Shift+J",
);
assert(!manifest.permissions.includes("<all_urls>"));
for (const file of [
  manifest.background.service_worker,
  manifest.action.default_popup,
  ...manifest.content_scripts.flatMap((s) => s.js),
])
  await access(`dist/${file}`);
for (const file of ["content.js", "background.js", "popup.js"]) {
  const source = await readFile(`dist/${file}`, "utf8");
  assert(
    !/\beval\s*\(|new Function\s*\(/.test(source),
    `Unsafe code evaluation in ${file}`,
  );
  assert(
    !/\.click\s*\(|\.focus\s*\(|dispatchEvent\s*\(|\.submit\s*\(|requestSubmit\s*\(/.test(
      source,
    ),
    `Automated page interaction in ${file}`,
  );
}
console.log(
  "Manifest V3, packaged entry points, CSP-safe bundles and no automated page input: verified.",
);
