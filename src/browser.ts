import { arimaForecast } from "./arima.js";
import { factorForecast, MARKET_TICKER } from "./factor.js";
import { normalizeTicker, toMonthLabel } from "./forecast.js";
import { fetchMonthlyBarsWeb } from "./web-quotes.js";

const HISTORY_YEARS = 30;

function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (node === null) {
    throw new Error(`#${id} がありません`);
  }
  return node;
}

function inputValue(id: string): string {
  const node = el(id);
  if (!(node instanceof HTMLInputElement)) {
    throw new Error(`#${id} が入力欄ではありません`);
  }
  return node.value;
}

/** 数表の tbody を作る。 */
function buildTable(headers: string[], rows: string[][]): HTMLTableElement {
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const h of headers) {
    const th = document.createElement("th");
    th.textContent = h;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const cell of row) {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

/** 結果表示域を空にする。 */
function clearResult(): void {
  for (const id of ["summary", "actuals", "methods", "forecast"]) {
    el(id).replaceChildren();
  }
}

function setStatus(message: string): void {
  el("status").textContent = message;
}

/** 予測を実行して結果を描画する。 */
async function run(): Promise<void> {
  clearResult();
  const ticker = normalizeTicker(inputValue("ticker"));
  const monthsRaw = Number(inputValue("months"));
  if (!Number.isInteger(monthsRaw) || monthsRaw < 1 || monthsRaw > 24) {
    setStatus("予測月数は 1〜24 の整数で指定してください");
    return;
  }
  const monthsAhead = monthsRaw;
  const button = el("run");
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("#run がボタンではありません");
  }
  button.disabled = true;
  setStatus("取得中…");
  try {
    const bars = await fetchMonthlyBarsWeb(ticker, HISTORY_YEARS);
    if (bars.length === 0) {
      setStatus(`データ取得失敗: ${ticker} の月足が0件でした`);
      return;
    }
    const arima = arimaForecast(bars, monthsAhead);
    const { p, d, q } = arima.order;

    // 概要と直近6か月の実績を描画する。
    const first = bars[0];
    const summary = el("summary");
    const items = [
      `銘柄: ${ticker}`,
      `学習データ: ${toMonthLabel(first.date)}〜${toMonthLabel(arima.lastDate)} 月足 ${arima.pointsUsed}件`,
      `直近終値: ${Math.round(arima.lastClose).toLocaleString()} 円`,
      `前提: 過去${HISTORY_YEARS}年の傾向が続くと仮定。`,
    ];
    const ul = document.createElement("ul");
    for (const text of items) {
      const li = document.createElement("li");
      li.textContent = text;
      ul.appendChild(li);
    }
    summary.appendChild(ul);
    const recent = [...bars]
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(-6);
    el("actuals").appendChild(
      buildTable(
        ["月", "終値(円)"],
        recent.map((b) => [toMonthLabel(b.date), Math.round(b.close).toLocaleString()]),
      ),
    );

    // 市場ファクターは失敗しても ARIMA だけ出す。
    let factorLabel = "ファクター";
    let factorMethod = "";
    let factorCloses: (number | null)[] = arima.points.map(() => null);
    try {
      const marketBars = await fetchMonthlyBarsWeb(MARKET_TICKER, HISTORY_YEARS);
      if (marketBars.length === 0) {
        throw new Error(`${MARKET_TICKER} の月足が0件でした`);
      }
      const factor = factorForecast(bars, marketBars, monthsAhead);
      factorMethod = `市場モデル(${factor.marketTicker}、β ${factor.beta.toFixed(2)}) による予測`;
      factorCloses = factor.points.map((pt) => pt.predictedClose);
    } catch (e) {
      factorMethod = `ファクター: ${e instanceof Error ? e.message : String(e)}`;
    }

    const methods = el("methods");
    for (const text of [
      `ARIMA(${p},${d},${q}) による時系列予測（AIC ${arima.aic.toFixed(1)}）`,
      factorMethod,
    ]) {
      const para = document.createElement("p");
      para.textContent = `手法: ${text}`;
      methods.appendChild(para);
    }
    el("forecast").appendChild(
      buildTable(
        ["月", "ARIMA(円)", `${factorLabel}(円)`],
        arima.points.map((pt, i) => [
          pt.label,
          Math.round(pt.predictedClose).toLocaleString(),
          factorCloses[i] === null ? "-" : Math.round(factorCloses[i]).toLocaleString(),
        ]),
      ),
    );
    setStatus("");
  } catch (e) {
    setStatus(`エラー: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    button.disabled = false;
  }
}

function init(): void {
  el("run").addEventListener("click", () => {
    void run();
  });
}

init();
