import { build } from "esbuild";
import { mkdir, copyFile, readdir, rm } from "node:fs/promises";
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await build({
  entryPoints: {
    content: "src/content/content.ts",
    background: "src/background.ts",
    popup: "src/popup.ts",
  },
  bundle: true,
  outdir: "dist",
  format: "iife",
  target: "chrome120",
  loader: { ".css": "text" },
  sourcemap: true,
});
await copyFile("manifest.json", "dist/manifest.json");
for (const name of await readdir("public"))
  await copyFile(`public/${name}`, `dist/${name}`);
console.log("Load unpacked: " + process.cwd() + "/dist");
