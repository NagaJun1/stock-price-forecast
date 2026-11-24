import { type MonthlyBar } from "./forecast.js";

/**
 * 同梱サーバの取得用 URL を作る。
 *
 * @param ticker - `7203.T` のような Yahoo Finance 形式のティッカー。
 * @param years - 取得する年数。
 */
export function buildChartUrl(ticker: string, years: number): string {
  return `/api/chart?ticker=${encodeURIComponent(ticker)}&years=${years}`;
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
 * 同梱サーバ経由で月足終値を取得する (同一生成元のため CORS 問題なし)。
 *
 * @param ticker - `7203.T` のような Yahoo Finance 形式のティッカー。
 * @param years - 取得する年数。
 * @returns 月足終値の配列。取得0件の場合は空配列。
 * @throws 通信エラー・応答異常時。
 */
export async function fetchMonthlyBarsWeb(ticker: string, years: number): Promise<MonthlyBar[]> {
  const res = await fetch(buildChartUrl(ticker, years));
  if (!res.ok) {
    throw new Error(`取得失敗: HTTP ${res.status}`);
  }
  return parseMonthlyBars(await res.json());
}
