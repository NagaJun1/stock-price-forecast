import {
  toMonthLabel,
  type ForecastPoint,
  type MonthlyBar,
} from "./forecast.js";

/** モデル別の予想結果の表示用データ。 */
export interface ModelReport {
  methodLine: string;
  points: ForecastPoint[];
}

/**
 * 銘柄・学習データ・直近実績の共通ヘッダを出力する。
 *
 * @param ticker - 表示用のティッカー。
 * @param bars - 取得した月足終値 (直近6か月の実績表示に使う)。
 * @param lastClose - 直近終値。
 * @param lastDate - 直近終値の日付。
 * @param pointsUsed - 学習に使った月足件数。
 * @param historyYears - 学習期間の年数 (前提文の表示用)。
 */
export function printHeader(
  ticker: string,
  bars: MonthlyBar[],
  lastClose: number,
  lastDate: Date,
  pointsUsed: number,
  historyYears: number,
): void {
  const first = bars[0];

  console.log(`銘柄: ${ticker}`);
  console.log(
    `学習データ: ${toMonthLabel(first.date)}〜${toMonthLabel(lastDate)} 月足 ${pointsUsed}件`,
  );
  console.log(`直近終値: ${Math.round(lastClose).toLocaleString()} 円`);
  console.log(`前提: 過去${historyYears}年の傾向が続くと仮定。投資助言ではない。`);
  console.log("");
  // 直近6か月分の実績終値を表示する。
  const recent = [...bars]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(-6);
  console.log("月 | 終値(円)");
  for (const b of recent) {
    console.log(`${toMonthLabel(b.date)} | ${Math.round(b.close).toLocaleString()}`);
  }
}

/** 比較表の1列分 (モデル名と表示用データ)。 */
export interface ComparisonColumn {
  label: string;
  data: ModelReport;
}

/**
 * 複数モデルの予想を横並びの表で出力する。行数は先頭列にそろえる。
 *
 * @param columns - 列の配列。使えない列は points を空にして理由を methodLine に入れる。
 */
export function printComparisonTable(columns: ComparisonColumn[]): void {
  console.log("");
  for (const column of columns) {
    console.log(`手法: ${column.data.methodLine}`);
  }
  console.log(["月", ...columns.map((c) => `${c.label}(円)`)].join(" | "));
  const rowCount = columns[0].data.points.length;
  for (let i = 0; i < rowCount; i++) {
    const cells = [columns[0].data.points[i].label];
    for (const column of columns) {
      // 使えない列の行は "-" とする。
      const point = column.data.points[i];
      cells.push(point === undefined ? "-" : Math.round(point.predictedClose).toLocaleString());
    }
    console.log(cells.join(" | "));
  }
}
