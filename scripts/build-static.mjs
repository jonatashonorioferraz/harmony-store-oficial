import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, "client"), { recursive: true });
await mkdir(resolve(dist, "server"), { recursive: true });
await cp(resolve(root, "web"), resolve(dist, "client"), { recursive: true });
await cp(resolve(root, "public", "harmony-store-logo.jpg"), resolve(dist, "client", "logo.jpg"));
await writeFile(resolve(dist, "client", ".nojekyll"), "");
await writeFile(resolve(dist, "server", "index.js"), `export default { async fetch(request, env) { const url = new URL(request.url); let response = await env.ASSETS.fetch(request); if (response.status === 404 && !url.pathname.split('/').pop().includes('.')) response = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url))); return response; } };\n`);
console.log("Harmony Store web app built successfully.");
