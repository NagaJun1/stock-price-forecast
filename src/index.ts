import { arimaForecast } from "./arima.js";
import { factorForecast, MARKET_TICKER } from "./factor.js";
import { normalizeTicker } from "./forecast.js";
import {
  printComparisonTable,
  printHeader,
  type ComparisonColumn,
  type ModelReport,
} from "./report.js";
import { fetchMonthlyBars } from "./quotes.js";

const DEFAULT_MONTHS_AHEAD = 12;
const HISTORY_YEARS = 30;

function printUsage(): void {
  console.log("使い方: node dist/index.js <証券コード> [予測月数(1-24, 既定12)]");
  console.log("例: node dist/index.js 7203");
  console.log("例: node dist/index.js 7203 6");
}

function parseMonthsAhead(raw: string | undefined): number {
  if (raw === undefined) {
    return DEFAULT_MONTHS_AHEAD;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 24) {
    throw new Error("予測月数は 1〜24 の整数で指定してください");
  }
  return n;
}

async function main(): Promise<void> {
  const [codeArg, monthsArg] = process.argv.slice(2);
  if (!codeArg || codeArg === "-h" || codeArg === "--help") {
    printUsage();
    process.exit(codeArg ? 0 : 1);
  }

  const ticker = normalizeTicker(codeArg);
  const monthsAhead = parseMonthsAhead(monthsArg);

  const bars = await fetchMonthlyBars(ticker, HISTORY_YEARS);
  if (bars.length === 0) {
    console.error(`データ取得失敗: ${ticker} の月足が0件でした`);
    process.exit(1);
  }

  // ARIMA で予測する (失敗したら終了)。
  let arima: ReturnType<typeof arimaForecast>;
  try {
    arima = arimaForecast(bars, monthsAhead);
  } catch (e) {
    console.error(`予測失敗: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
  printHeader(ticker, bars, arima.lastClose, arima.lastDate, arima.pointsUsed, HISTORY_YEARS);
  const { p, d, q } = arima.order;
  const columns: ComparisonColumn[] = [
    {
      label: "ARIMA",
      data: {
        methodLine: `ARIMA(${p},${d},${q}) による時系列予測（AIC ${arima.aic.toFixed(1)}）`,
        points: arima.points,
      },
    },
  ];
  // 市場ファクターモデルで予測する (失敗しても ARIMA の結果は出す)。
  const fallback = (name: string, e: unknown): ModelReport => ({
    methodLine: `${name}: ${e instanceof Error ? e.message : String(e)}`,
    points: [],
  });
  try {
    const marketBars = await fetchMonthlyBars(MARKET_TICKER, HISTORY_YEARS);
    if (marketBars.length === 0) {
      throw new Error(`${MARKET_TICKER} の月足が0件でした`);
    }
    const factor = factorForecast(bars, marketBars, monthsAhead);
    columns.push({
      label: "ファクター",
      data: {
        methodLine: `市場モデル(${factor.marketTicker}、β ${factor.beta.toFixed(2)}) による予測`,
        points: factor.points,
      },
    });
  } catch (e) {
    columns.push({ label: "ファクター", data: fallback("ファクター", e) });
  }
  printComparisonTable(columns);
}

main().catch((err: unknown) => {
  console.error(`エラー: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
