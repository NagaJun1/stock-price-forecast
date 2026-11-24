import YahooFinance from "yahoo-finance2";
import { type MonthlyBar } from "./forecast.js";

/** お知らせ表示を抑えたクライアントを作る。 */
function createClient() {
  return new YahooFinance({ suppressNotices: ["yahooSurvey"] });
}

/**
 * 指定年数分の月足終値を取得する。
 *
 * @param ticker - `7203.T` のような Yahoo Finance 形式のティッカー。
 * @param years - 取得する年数。
 * @returns 月足終値の配列。取得0件の場合は空配列 (呼び出し側がエラーを表示して終了する)。
 * 日付の昇順は保証しない。必要なら呼び出し側で整列すること。
 * @throws 通信エラー時。
 */
export async function fetchMonthlyBars(ticker: string, years: number): Promise<MonthlyBar[]> {
  const yf = createClient();
  // 指定年数前を起点にする。
  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - years);
  const res = await yf.chart(ticker, {
    period1,
    interval: "1mo", // 月足で取得する。
  });
  const bars: MonthlyBar[] = [];
  for (const q of res.quotes) {
    // 終値が欠損・非数値の足を除外する。
    if (q.close != null && Number.isFinite(q.close)) {
      bars.push({ date: q.date, close: q.close });
    }
  }
  return bars;
}

