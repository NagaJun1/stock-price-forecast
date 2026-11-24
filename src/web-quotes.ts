import { type MonthlyBar } from "./forecast.js";

/** Yahoo chart API のエンドポイント。 */
const YAHOO_HOSTS = [
  "https://query1.finance.yahoo.com",
  "https://query2.finance.yahoo.com",
];

/** ブラウザから使う CORS プロキシ (上から順に試す)。 */
const PROXIES = [
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
];

/**
 * Yahoo chart API の URL を作る。
 *
 * @param host - `query1` か `query2` のホスト。
 * @param ticker - `7203.T` のような Yahoo Finance 形式のティッカー。
 * @param years - 取得する年数。
 */
export function buildChartUrl(host: string, ticker: string, years: number): string {
  const now = Math.floor(Date.now() / 1000);
  const period1 = now - years * 365 * 24 * 60 * 60;
  return `${host}/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${period1}&period2=${now}&interval=1mo`;
}

/**
 * v8 chart の応答から月足終値を抜き出す。
 *
 * @param body - `fetch` で受けた JSON。
 * @returns 月足終値の配列 (古い順)。欠損は除く。
 * @throws 形状が想定外のとき。
 */
export function parseMonthlyBars(body: unknown): MonthlyBar[] {
  // 必要な深さまで unknown のまま掘り、数値を確認してから使う。
  const root = body as {
    chart?: { result?: unknown; error?: unknown };
  };
  const result = root.chart?.result;
  if (!Array.isArray(result) || result.length === 0) {
    throw new Error("株価データの形式が想定外です");
  }
  const first = result[0] as {
    timestamp?: unknown;
    indicators?: { quote?: unknown };
  };
  if (!Array.isArray(first.timestamp)) {
    throw new Error("株価データに時刻がありません");
  }
  const quotes = first.indicators?.quote;
  const closes = (Array.isArray(quotes) ? quotes[0] : undefined) as
    | { close?: unknown }
    | undefined;
  if (!Array.isArray(closes?.close)) {
    throw new Error("株価データに終値がありません");
  }
  const bars: MonthlyBar[] = [];
  const timestamps = first.timestamp as unknown[];
  const closeValues = closes.close as unknown[];
  const n = Math.min(timestamps.length, closeValues.length);
  for (let i = 0; i < n; i++) {
    const time = timestamps[i];
    const close = closeValues[i];
    // 終値が欠損・非数値の足を除外する。
    if (typeof time === "number" && typeof close === "number" && Number.isFinite(close)) {
      bars.push({ date: new Date(time * 1000), close });
    }
  }
  return bars.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * ブラウザから月足終値を取得する。Yahoo 直呼びは CORS で遮られるため、
 * 公開プロキシ経由で取得し、ホストとプロキシを順に切り替えて再試行する。
 *
 * @param ticker - `7203.T` のような Yahoo Finance 形式のティッカー。
 * @param years - 取得する年数。
 * @returns 月足終値の配列。取得0件の場合は空配列。
 * @throws すべて失敗したとき (最後のエラーを投げる)。
 */
export async function fetchMonthlyBarsWeb(ticker: string, years: number): Promise<MonthlyBar[]> {
  let lastError: unknown = new Error("取得できませんでした");
  for (const host of YAHOO_HOSTS) {
    const url = buildChartUrl(host, ticker, years);
    for (const via of PROXIES) {
      try {
        const res = await fetch(via(url));
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const bars = parseMonthlyBars(await res.json());
        if (bars.length > 0) {
          return bars;
        }
        // 空でも形状は正常なので次ホストは試さず空で返す。
        return bars;
      } catch (e) {
        lastError = e;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
