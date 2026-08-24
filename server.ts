import { resolve, sep } from "node:path";

const port = Number.parseInt(Bun.env.UI_PORT || "8093", 10);
const apiBase = new URL(Bun.env.AI_PROFILER_API_URL || "http://127.0.0.1:8092");
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

async function proxy(request: Request, url: URL): Promise<Response> {
  const target = new URL(`${url.pathname}${url.search}`, apiBase);
  const headers = new Headers(request.headers);
  headers.delete("host");
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  });
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/") || url.pathname === "/file") {
      return proxy(request, url);
    }
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
console.log(`API backend: ${apiBase.href}`);
