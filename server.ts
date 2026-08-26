import { resolve, sep } from "node:path";
import { api } from "./api";
import { closeDatabase } from "./db/database";

const port = Number.parseInt(Bun.env.UI_PORT || "8093", 10);
const staticRoot = resolve(import.meta.dir, "static");

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function staticFile(pathname: string): Response {
  let relativePath: string;
  try {
    relativePath = decodeURIComponent(pathname.slice("/static/".length));
  } catch {
    return new Response("Invalid path", { status: 400 });
  }
  const filePath = resolve(staticRoot, relativePath);
  if (filePath !== staticRoot && !filePath.startsWith(`${staticRoot}${sep}`)) {
    return new Response("Invalid path", { status: 400 });
  }
  const file = Bun.file(filePath);
  const extension = filePath.slice(filePath.lastIndexOf("."));
  return new Response(file, {
    headers: contentTypes[extension] ? { "content-type": contentTypes[extension] } : undefined,
  });
}

const server = Bun.serve({
  hostname: Bun.env.UI_HOST || "127.0.0.1",
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const apiResponse = await api(request, url);
    if (apiResponse) return apiResponse;
    if (url.pathname.startsWith("/static/")) {
      return staticFile(url.pathname);
    }
    if (url.pathname === "/favicon.ico") {
      return staticFile("/static/favicon.svg");
    }
    if (url.pathname === "/" || url.pathname === "/app" || url.pathname === "/app/") {
      return new Response(Bun.file(resolve(staticRoot, "index.html")), {
        headers: { "content-type": contentTypes[".html"] },
      });
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`AI Profiler UI: http://${server.hostname}:${server.port}/app/`);
console.log("Storage backend: PostgreSQL");

process.on("SIGINT", async () => {
  await closeDatabase();
  process.exit(0);
});
