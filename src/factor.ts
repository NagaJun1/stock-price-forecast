import { arimaForecast } from "./arima.js";
import {
  addMonths,
  toMonthLabel,
  type ForecastPoint,
  type MonthlyBar,
} from "./forecast.js";

/** 市場ファクターのティッカー (日経平均)。 */
export const MARKET_TICKER = "^N225";

/** `factorForecast` の結果。 */
export interface FactorForecastResult {
  beta: number;
  alpha: number;
  marketTicker: string;
  lastClose: number;
  lastDate: Date;
  pointsUsed: number;
  points: ForecastPoint[];
}

/**
 * 市場ファクターモデルで先行きを予測する。市場自体の将来値は ARIMA で予測する。
 *
 * @param stockBars - 銘柄の月足終値。
 * @param marketBars - 市場ファクターの月足終値。
 * @param monthsAhead - 予測月数 (1〜24 の整数)。
 * @returns ベータ・アルファと予測点列。突き合わせに使った月数が pointsUsed に入る。
 * @throws 突き合わせ後の月数が13件未満のとき、市場に変動がないとき、当てはめ失敗時。
 */
export function factorForecast(
  stockBars: MonthlyBar[],
  marketBars: MonthlyBar[],
  monthsAhead: number,
): FactorForecastResult {
  if (!Number.isInteger(monthsAhead) || monthsAhead < 1 || monthsAhead > 24) {
    throw new Error("monthsAhead は 1〜24 の整数で指定してください");
  }
  // 月ラベルで突き合わせてペアを作る。
  const marketByMonth = new Map(marketBars.map((b) => [toMonthLabel(b.date), b]));
  const pairs: { date: Date; stock: number; market: number }[] = [];
  for (const s of stockBars) {
    const m = marketByMonth.get(toMonthLabel(s.date));
    // 非正の終値は対数リターンにできないため除外する。
    if (m !== undefined && s.close > 0 && m.close > 0) {
      pairs.push({ date: s.date, stock: s.close, market: m.close });
    }
  }
  pairs.sort((a, b) => a.date.getTime() - b.date.getTime());
  if (pairs.length < 13) {
    throw new Error(`データ不足: 突き合わせ後の月足が${pairs.length}件しかありません（最低13件必要）`);
  }

  // 対数リターンを求める。
  const stockReturns: number[] = [];
  const marketReturns: number[] = [];
  for (let i = 1; i < pairs.length; i++) {
    stockReturns.push(Math.log(pairs[i].stock / pairs[i - 1].stock));
    marketReturns.push(Math.log(pairs[i].market / pairs[i - 1].market));
  }

  // 最小二乗で rs = α + β rm に当てはめる。
  const n = stockReturns.length;
  const meanStock = stockReturns.reduce((s, v) => s + v, 0) / n;
  const meanMarket = marketReturns.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varMarket = 0;
  for (let i = 0; i < n; i++) {
    cov += (stockReturns[i] - meanStock) * (marketReturns[i] - meanMarket);
    varMarket += (marketReturns[i] - meanMarket) ** 2;
  }
  if (varMarket <= 0) {
    throw new Error("市場リターンに変動がありません");
  }
  const beta = cov / varMarket;
  const alpha = meanStock - beta * meanMarket;

  // 市場の将来値を ARIMA で予測する。
  const marketForecast = arimaForecast(marketBars, monthsAhead);
  // 市場予測から銘柄リターンを求め、水準に戻す (将来の市場ショックは ARIMA 予測に織り込み済み)。
  const sortedMarket = [...marketBars].sort((a, b) => a.date.getTime() - b.date.getTime());
  let prevMarket = sortedMarket[sortedMarket.length - 1].close;
  const sortedStock = [...stockBars].sort((a, b) => a.date.getTime() - b.date.getTime());
  const last = sortedStock[sortedStock.length - 1];
  let prevStock = last.close;
  const points: ForecastPoint[] = [];
  for (let k = 1; k <= monthsAhead; k++) {
    const marketClose = marketForecast.points[k - 1].predictedClose;
    const marketReturn = Math.log(marketClose / prevMarket);
    prevStock = prevStock * Math.exp(alpha + beta * marketReturn);
    prevMarket = marketClose;
    points.push({
      monthAhead: k,
      label: toMonthLabel(addMonths(last.date, k)),
      predictedClose: prevStock,
    });
  }

  return {
    beta,
    alpha,
    marketTicker: MARKET_TICKER,
    lastClose: last.close,
    lastDate: last.date,
    pointsUsed: pairs.length,
    points,
  };
}
