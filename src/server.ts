import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT ?? 3000);
const SITE_DIR = fileURLToPath(new URL("..", import.meta.url));
// 配下判定用に末尾区切り付きの形も用意する
// (fileURLToPath は末尾区切りを残すことがあり、そのまま足すと二重になる)。
const SITE_PREFIX = SITE_DIR.endsWith(sep) ? SITE_DIR : SITE_DIR + sep;
const YAHOO_HOSTS = [
  "https://query1.finance.yahoo.com",
  "https://query2.finance.yahoo.com",
];

/** Yahoo chart API の URL を作る。 */
function yahooUrl(host: string, ticker: string, years: number): string {
  const now = Math.floor(Date.now() / 1000);
  const period1 = now - years * 365 * 24 * 60 * 60;
  return `${host}/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${period1}&period2=${now}&interval=1mo`;
}

/**
 * Yahoo から月足を取得してそのまま返す。ホストを順に切り替えて再試行する。
 *
 * @param ticker - Yahoo Finance 形式のティッカー。
 * @param years - 取得する年数。
 * @throws すべて失敗したとき (最後のエラーを投げる)。
 */
async function proxyYahoo(ticker: string, years: number): Promise<Response> {
  let lastError: unknown = new Error("取得できませんでした");
  for (const host of YAHOO_HOSTS) {
    try {
      // Yahoo が素の fetch を弾くためブラウザ相当の UA を付ける。
      const res = await fetch(yahooUrl(host, ticker, years), {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      });
      if (!res.ok) {
        throw new Error(`Yahoo HTTP ${res.status}`);
      }
      return res;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

/** パスが公開ディレクトリ配下かを確かめる。 */
function safePath(urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const full = normalize(join(SITE_DIR, decoded === "/" ? "index.html" : decoded));
  if (full !== SITE_DIR && !full.startsWith(SITE_PREFIX)) {
    return null;
  }
  return full;
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/api/chart" && req.method === "GET") {
      const ticker = url.searchParams.get("ticker") ?? "";
      const years = Number(url.searchParams.get("years") ?? "30");
      if (ticker === "" || !Number.isFinite(years) || years <= 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "ticker と years を指定してください" }));
        return;
      }
      try {
        const upstream = await proxyYahoo(ticker, years);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(await upstream.text());
      } catch (e) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
      }
      return;
    }
    // 静的ファイルを配信する。
    const full = req.method === "GET" ? safePath(url.pathname) : null;
    if (full === null) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("forbidden");
      return;
    }
    try {
      const body = await readFile(full);
      res.writeHead(200, { "Content-Type": MIME[extname(full)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
    }
  })();
});

server.listen(PORT, () => {
  console.log(`http://localhost:${PORT} で公開中`);
});
