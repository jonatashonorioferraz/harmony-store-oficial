import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const web = resolve(root, "web");

// Estes arquivos têm uma cópia oficial em web/ para o GitHub Pages. Mantê-los
// sincronizados durante o build evita publicar um shell antigo com JavaScript
// novo (ou o contrário), principalmente após uma atualização do PWA.
for (const filename of [
  "CHANGELOG.md",
  "agenda-harmony.css",
  "agenda-harmony.js",
  "help-center.js",
  "index.html",
  "service-worker.js",
  "shopee-intelligence.css",
  "shopee-intelligence.js",
]) {
  await cp(resolve(root, filename), resolve(web, filename));
}
try {
  await rm(dist, { recursive: true, force: true });
} catch (error) {
  // Windows pode manter a pasta aberta por alguns instantes (visualização ou
  // antivírus). Nesse caso limpamos seu conteúdo e reutilizamos o diretório.
  if (!['EBUSY', 'EPERM'].includes(error?.code)) throw error;
  await mkdir(dist, { recursive: true });
  for (const entry of await readdir(dist)) {
    await rm(resolve(dist, entry), { recursive: true, force: true }).catch(inner => {
      if (!['EBUSY', 'EPERM'].includes(inner?.code)) throw inner;
    });
  }
}
await mkdir(resolve(dist, "client"), { recursive: true });
await mkdir(resolve(dist, "server"), { recursive: true });
await cp(web, resolve(dist, "client"), { recursive: true });
await cp(resolve(root, "production-orders.js"), resolve(dist, "client", "production-orders.js"));
await cp(resolve(root, "production-orders.css"), resolve(dist, "client", "production-orders.css"));
await cp(resolve(root, "shipping-planning.js"), resolve(dist, "client", "shipping-planning.js"));
await cp(resolve(root, "shipping-planning.css"), resolve(dist, "client", "shipping-planning.css"));
await cp(resolve(root, "shipping-inventory-integration.js"), resolve(dist, "client", "shipping-inventory-integration.js"));
await mkdir(resolve(dist, "client", "assets"), { recursive: true });
for (const filename of ["platform-mercado-livre.svg", "platform-shopee.svg", "shipping-product-placeholder.svg"]) {
  await cp(resolve(root, "assets", filename), resolve(dist, "client", "assets", filename));
}
await cp(resolve(root, "help-center.js"), resolve(dist, "client", "help-center.js"));
await cp(resolve(root, "system-health.js"), resolve(dist, "client", "system-health.js"));
await cp(resolve(root, "CHANGELOG.md"), resolve(dist, "client", "CHANGELOG.md"));
await cp(resolve(root, "public", "harmony-store-logo.jpg"), resolve(dist, "client", "logo.jpg"));
await writeFile(resolve(dist, "client", ".nojekyll"), "");
await writeFile(resolve(dist, "server", "index.js"), `export default { async fetch(request, env) { const url = new URL(request.url); let response = await env.ASSETS.fetch(request); if (response.status === 404 && !url.pathname.split('/').pop().includes('.')) response = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url))); return response; } };\n`);
console.log("Harmony Store web app built successfully.");
