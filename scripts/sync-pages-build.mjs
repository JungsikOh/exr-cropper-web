import { cpSync, existsSync, mkdirSync, rmSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const distHtml = join(dist, "index.source.html");
const distIndex = join(dist, "index.html");
const rootIndex = join(root, "index.html");
const distAssets = join(dist, "assets");
const rootAssets = join(root, "assets");

copyFileSync(distHtml, distIndex);
copyFileSync(distHtml, rootIndex);

if (existsSync(rootAssets)) {
  rmSync(rootAssets, { recursive: true, force: true });
}
mkdirSync(rootAssets, { recursive: true });
cpSync(distAssets, rootAssets, { recursive: true });
