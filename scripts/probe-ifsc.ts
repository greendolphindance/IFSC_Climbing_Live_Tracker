import { chromium, type Request, type Response, type WebSocket } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const target = process.argv[2] ?? "https://ifsc.results.info/event/1480/cr/10385";
const outDir = "docs/network-captures";

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  extraHTTPHeaders: {
    "accept-language": "en-US,en;q=0.9"
  }
});
const captures: unknown[] = [];

function record(kind: string, payload: unknown) {
  captures.push({ kind, capturedAt: new Date().toISOString(), payload });
}

page.on("request", (request: Request) => {
  const type = request.resourceType();
  if (["xhr", "fetch", "websocket"].includes(type)) {
    void request.allHeaders().then((headers) => {
      record("request", { method: request.method(), url: request.url(), resourceType: type, headers, postData: request.postData() });
    });
  }
});

page.on("response", async (response: Response) => {
  const request = response.request();
  const type = request.resourceType();
  if (!["xhr", "fetch"].includes(type)) return;
  const contentType = response.headers()["content-type"] ?? "";
  let body: unknown = undefined;
  if (contentType.includes("json")) {
    try {
      body = await response.json();
    } catch {
      body = "<json parse failed>";
    }
  } else {
    const text = await response.text().catch(() => "");
    body = text.slice(0, 2000);
  }
  record("response", { url: response.url(), status: response.status(), contentType, headers: response.headers(), body });
});

page.on("websocket", (socket: WebSocket) => {
  record("websocket-open", { url: socket.url() });
  socket.on("framereceived", (frame) => record("websocket-frame-received", { url: socket.url(), payload: frame.payload.toString().slice(0, 4000) }));
  socket.on("framesent", (frame) => record("websocket-frame-sent", { url: socket.url(), payload: frame.payload.toString().slice(0, 4000) }));
});

await gotoWithRetry(target, 3);
await page.waitForTimeout(15_000);
await browser.close();

const filename = join(outDir, `ifsc-${Date.now()}.json`);
await writeFile(filename, JSON.stringify({ target, captures }, null, 2));
console.log(`Wrote ${filename}`);

async function gotoWithRetry(url: string, attempts: number) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      return;
    } catch (error) {
      lastError = error;
      record("navigation-error", { attempt, message: error instanceof Error ? error.message : String(error) });
      await page.waitForTimeout(1_500 * attempt);
    }
  }
  throw lastError;
}
