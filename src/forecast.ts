export interface MonthlyBar {
  date: Date;
  close: number;
}

export interface ForecastPoint {
  /** 1 = 来月 */
  monthAhead: number;
  label: string;
  predictedClose: number;
}

/** 4桁数字なら東証として .T を付与する。 */
export function normalizeTicker(input: string): string {
  const code = input.trim().toUpperCase();
  if (/^\d{4}$/.test(code)) {
    return `${code}.T`;
  }
  return code;
}

/** 月ラベルを YYYY-MM で作る。 */
export function toMonthLabel(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** 最終月から n か月後の同月を作る（日付ずれ防止で月初基準）。 */
export function addMonths(base: Date, n: number): Date {
  return new Date(base.getFullYear(), base.getMonth() + n, 1);
}


