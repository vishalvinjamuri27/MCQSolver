import {practiceRoute} from './practice.mjs';
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
const bundle = await build({
  entryPoints: ["demo/demo.ts"],
  bundle: true,
  write: false,
  format: "iife",
  target: "chrome120",
  loader: { ".css": "text" },
});
const files = {
  "/": ["demo/index.html", "text/html"],
  "/practice": ["practice/index.html", "text/html"],
  "/practice/": ["practice/index.html", "text/html"],
  "/practice/style.css": ["practice/style.css", "text/css"],
  "/practice/app.js": ["practice/app.js", "text/javascript"],
  "/demo.css": ["demo/demo.css", "text/css"],
};
const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://127.0.0.1").pathname;
  if(await practiceRoute(req,res,path))return;
  if (path === "/demo.js") {
    res.writeHead(200, { "Content-Type": "text/javascript" });
    res.end(bundle.outputFiles[0].text);
    return;
  }
  const file = files[path];
  if (!file) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  try {
    res.writeHead(200, {
      "Content-Type": file[1],
      "Cache-Control": "no-store",
    });
    res.end(await readFile(file[0]));
  } catch {
    res.writeHead(500);
    res.end("Demo file missing");
  }
});
server.listen(4173, "127.0.0.1", () =>
  console.log(
    "Practice: http://127.0.0.1:4173/practice · Demo: http://127.0.0.1:4173 · Extension test: http://127.0.0.1:4173/?extension=1",
  ),
);
