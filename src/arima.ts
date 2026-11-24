import {
  addMonths,
  toMonthLabel,
  type ForecastPoint,
  type MonthlyBar,
} from "./forecast.js";

/** ARIMA の次数 (p: AR 項数、d: 差分回数、q: MA 項数)。 */
export interface ArimaOrder {
  p: number;
  d: number;
  q: number;
}

/** `arimaForecast` の次数探索範囲の指定。 */
export interface ArimaOptions {
  maxP?: number;
  maxD?: number;
  maxQ?: number;
}

/** `arimaForecast` の結果。 */
export interface ArimaForecastResult {
  order: ArimaOrder;
  aic: number;
  lastClose: number;
  lastDate: Date;
  pointsUsed: number;
  points: ForecastPoint[];
}

/** 当てはめ済みの ARIMA モデル (予測に使う内部表現)。 */
interface ArimaFit {
  order: ArimaOrder;
  intercept: number;
  ar: number[];
  ma: number[];
  residuals: number[];
  sigma2: number;
  aic: number;
}

/**
 * 系列を d 回差分する。
 *
 * @param values - 元系列。
 * @param d - 差分回数。
 * @returns 差分系列 (d=0 のときは元系列と同じ内容)。
 */
function difference(values: number[], d: number): number[] {
  let out = values;
  for (let k = 0; k < d; k++) {
    const next: number[] = [];
    for (let i = 1; i < out.length; i++) {
      next.push(out[i] - out[i - 1]);
    }
    out = next;
  }
  return out;
}

/**
 * 最小二乗解を求める。特異な場合は null を返す。
 *
 * @param design - 計画行列 (各行が説明変数)。
 * @param target - 目的変数。
 * @returns 回帰係数。解けないときは null。
 */
function leastSquares(design: number[][], target: number[]): number[] | null {
  if (design.length === 0 || design[0].length === 0) {
    return null;
  }
  const m = design[0].length;
  // 正規方程式 (X'X)b = X'y を組み立てる。
  const a: number[][] = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  const b: number[] = new Array<number>(m).fill(0);
  for (let i = 0; i < target.length; i++) {
    const row = design[i];
    for (let j = 0; j < m; j++) {
      b[j] += row[j] * target[i];
      for (let k = j; k < m; k++) {
        a[j][k] += row[j] * row[k];
      }
    }
  }
  for (let j = 0; j < m; j++) {
    for (let k = 0; k < j; k++) {
      a[j][k] = a[k][j];
    }
  }
  // 部分ピボット付きガウス消去で解く。
  for (let col = 0; col < m; col++) {
    let pivot = col;
    for (let row = col + 1; row < m; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) {
        pivot = row;
      }
    }
    if (Math.abs(a[pivot][col]) < 1e-12) {
      return null;
    }
    if (pivot !== col) {
      const tmpRow = a[pivot];
      a[pivot] = a[col];
      a[col] = tmpRow;
      const tmpB = b[pivot];
      b[pivot] = b[col];
      b[col] = tmpB;
    }
    for (let row = col + 1; row < m; row++) {
      const factor = a[row][col] / a[col][col];
      for (let k = col; k < m; k++) {
        a[row][k] -= factor * a[col][k];
      }
      b[row] -= factor * b[col];
    }
  }
  const coef = new Array<number>(m).fill(0);
  for (let row = m - 1; row >= 0; row--) {
    let s = b[row];
    for (let k = row + 1; k < m; k++) {
      s -= a[row][k] * coef[k];
    }
    coef[row] = s / a[row][row];
  }
  return coef;
}

/**
 * 差分済み系列に ARIMA(p, q) を当てはめる。MA 項は Hannan-Rissanen 法で求める。
 *
 * @param w - 差分済み系列。
 * @param p - AR 項数。
 * @param q - MA 項数。
 * @param d - 差分回数 (次数の記録用)。
 * @returns 当てはめ結果。データ不足や特異な場合は null。
 */
function fitArimaOne(w: number[], p: number, q: number, d: number): ArimaFit | null {
  const n = w.length;
  if (p === 0 && q === 0) {
    // 平均モデル (d=1 のときはドリフト付きランダムウォークに相当)。
    const mean = w.reduce((s, v) => s + v, 0) / n;
    const residuals = w.map((v) => v - mean);
    const sse = residuals.reduce((s, e) => s + e * e, 0);
    if (n - 1 <= 0) {
      return null;
    }
    // 完全一致の場合は分散に下限を設ける (log(0) 回避)。
    const sigma2 = Math.max(sse / (n - 1), 1e-12);
    return {
      order: { p, d, q },
      intercept: mean,
      ar: [],
      ma: [],
      residuals,
      sigma2,
      aic: n * Math.log(sigma2) + 2,
    };
  }
  // 1段目: 長めの AR で残差 (ショックの代理) を推定する。
  const longLag = Math.min(Math.max(p + q, 1) + 2, Math.floor(n / 3));
  if (longLag < 1 || n - longLag < p + q + 2) {
    return null;
  }
  const design1: number[][] = [];
  const target1: number[] = [];
  for (let t = longLag; t < n; t++) {
    const row = [1];
    for (let lag = 1; lag <= longLag; lag++) {
      row.push(w[t - lag]);
    }
    design1.push(row);
    target1.push(w[t]);
  }
  const coef1 = leastSquares(design1, target1);
  if (coef1 === null) {
    return null;
  }
  const residuals = new Array<number>(n).fill(0);
  for (let t = longLag; t < n; t++) {
    let fitted = coef1[0];
    for (let lag = 1; lag <= longLag; lag++) {
      fitted += coef1[lag] * w[t - lag];
    }
    residuals[t] = w[t] - fitted;
  }
  // 2段目: AR ラグと残差ラグに回帰して係数を求める。
  const start = Math.max(p, q, longLag);
  if (n - start < p + q + 2) {
    return null;
  }
  const design2: number[][] = [];
  const target2: number[] = [];
  for (let t = start; t < n; t++) {
    const row = [1];
    for (let lag = 1; lag <= p; lag++) {
      row.push(w[t - lag]);
    }
    for (let lag = 1; lag <= q; lag++) {
      row.push(residuals[t - lag]);
    }
    design2.push(row);
    target2.push(w[t]);
  }
  const coef2 = leastSquares(design2, target2);
  if (coef2 === null) {
    return null;
  }
  let sse = 0;
  for (let t = start; t < n; t++) {
    let fitted = coef2[0];
    let idx = 1;
    for (let lag = 1; lag <= p; lag++) {
      fitted += coef2[idx++] * w[t - lag];
    }
    for (let lag = 1; lag <= q; lag++) {
      fitted += coef2[idx++] * residuals[t - lag];
    }
    const e = w[t] - fitted;
    sse += e * e;
  }
  const effectiveN = n - start;
  const df = effectiveN - (p + q + 1);
  if (df <= 0) {
    return null;
  }
  // 完全一致の場合は分散に下限を設ける (log(0) 回避)。
  const sigma2 = Math.max(sse / df, 1e-12);
  return {
    order: { p, d, q },
    intercept: coef2[0],
    ar: coef2.slice(1, 1 + p),
    ma: coef2.slice(1 + p),
    residuals,
    sigma2,
    aic: effectiveN * Math.log(sigma2) + 2 * (p + q + 1),
  };
}

/**
 * 月足終値に ARIMA を当てはめ、AIC 最小の次数で先行きを予測する。
 *
 * @param bars - 月足終値。12件以上必要。
 * @param monthsAhead - 予測月数 (1〜24 の整数)。
 * @param options - 次数の探索範囲。既定は p≦2、d≦1、q≦2。
 * @returns 選択された次数、AIC、予測点列。
 * @throws データ不足時、当てはめ失敗時。
 */
export function arimaForecast(
  bars: MonthlyBar[],
  monthsAhead: number,
  options?: ArimaOptions,
): ArimaForecastResult {
  if (bars.length < 12) {
    throw new Error(`データ不足: 月足が${bars.length}件しかありません（ARIMA は最低12件必要）`);
  }
  if (!Number.isInteger(monthsAhead) || monthsAhead < 1 || monthsAhead > 24) {
    throw new Error("monthsAhead は 1〜24 の整数で指定してください");
  }
  const maxP = options?.maxP ?? 2;
  const maxD = options?.maxD ?? 1;
  const maxQ = options?.maxQ ?? 2;

  const sorted = [...bars].sort((a, b) => a.date.getTime() - b.date.getTime());
  const levels = sorted.map((b) => b.close);

  // AIC が最小の次数を選ぶ (d が異なる場合の比較は近似)。
  let best: ArimaFit | null = null;
  for (let d = 0; d <= maxD; d++) {
    const w = difference(levels, d);
    if (w.length < 6) {
      continue;
    }
    for (let p = 0; p <= maxP; p++) {
      for (let q = 0; q <= maxQ; q++) {
        const fit = fitArimaOne(w, p, q, d);
        if (fit !== null && (best === null || fit.aic < best.aic)) {
          best = fit;
        }
      }
    }
  }
  if (best === null) {
    throw new Error("ARIMA の当てはめに失敗しました");
  }

  const { p, d, q } = best.order;
  const w = difference(levels, d);
  // 差分系列の予測を再帰的に求める (将来のショックは 0 と置く)。
  const extended = [...w];
  const extendedShock = [...best.residuals];
  const diffForecasts: number[] = [];
  for (let h = 0; h < monthsAhead; h++) {
    const t = extended.length;
    let pred = best.intercept;
    for (let lag = 1; lag <= p; lag++) {
      pred += best.ar[lag - 1] * extended[t - lag];
    }
    for (let lag = 1; lag <= q; lag++) {
      pred += best.ma[lag - 1] * extendedShock[t - lag];
    }
    extended.push(pred);
    extendedShock.push(0);
    diffForecasts.push(pred);
  }
  // 差分を戻して水準に戻す (tails[i] は i 回差分系列の末尾値)。
  const tails: number[] = [];
  for (let i = 0; i <= d; i++) {
    const tail = difference(levels, i).at(-1);
    if (tail === undefined) {
      throw new Error("ARIMA の予測に失敗しました");
    }
    tails.push(tail);
  }
  const current = [...tails];
  const last = sorted[sorted.length - 1];
  const points: ForecastPoint[] = [];
  for (let k = 1; k <= monthsAhead; k++) {
    let value = diffForecasts[k - 1];
    for (let i = d - 1; i >= 0; i--) {
      value = current[i] + value;
      current[i] = value;
    }
    points.push({
      monthAhead: k,
      label: toMonthLabel(addMonths(last.date, k)),
      predictedClose: value,
    });
  }

  return {
    order: best.order,
    aic: best.aic,
    lastClose: last.close,
    lastDate: last.date,
    pointsUsed: sorted.length,
    points,
  };
}
