import { build as viteBuild } from "vite";
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
// Reuse EXACTLY the existing Creator React UI, built with a browser-specific base path.
await viteBuild({
  root:"apps/desktop",
  base:"/app/",
  build:{outDir:resolve("apps/web/public/app"),emptyOutDir:true}
});
copyFileSync("apps/web/browser-bridge.js","apps/web/public/app/browser-bridge.js");
for(const file of ["demo.html","demo.js","demo.css"])copyFileSync("apps/web/"+file,"apps/web/public/app/"+file);
const html="apps/web/public/app/index.html";
let body=readFileSync(html,"utf8").replace("<head>","<head><script src=\"/app/browser-bridge.js\"></script>");
writeFileSync(html,body);
console.log("Cloudflare Creator web assets built. Email/Instagram OAuth require configured Cloudflare + Meta accounts.");
