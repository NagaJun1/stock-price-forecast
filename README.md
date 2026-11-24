# 日本株 株価予想アプリ

ブラウザで動く日本株 月次長期予想アプリ。GitHub Pages で公開できる。

## 目的

ブラウザ上で月ごとの長期予想値を参考情報として表示する。

## 機能要件

- 銘柄指定（証券コード。4桁数字は `7203` → `7203.T` に自動補完）
- 月足終値・直近値のブラウザ表示
- 先1〜24か月の予想終値の表示（既定12か月）
- 予想根拠の表示（使用モデル、前提条件）

## システム構成

- 形態: フロントエンドのみの静的Webアプリ（フレームワーク不使用、ビルドは `tsc` のみ）
- 言語: TypeScript（`src/browser.ts` がエントリ、`site/` 以下が公開物。`site/js/` はビルド生成物のため git 管理外で、CI で生成する）
- データ保存: なし（DB不使用）
- パッケージ管理: npm
- 計算ロジック（`forecast.ts`・`arima.ts`・`factor.ts`）は依存なしの純粋関数

## データソース

- 採用: Yahoo Finance chart API（v8）をブラウザの `fetch` で直接取得
- Yahoo はブラウザ直接呼び出しを CORS で遮断するため、公開 CORS プロキシ経由で取得する（allorigins → codetabs → corsproxy.io の順に再試行）
- 除外: J-Quants API（制約が大きく使いづらいため）
- APIキー不要

## 予想ロジック

1. ARIMA: 過去30年の月次終値に ARIMA(p,d,q) を当てはめ、AIC で次数選択して予測する（既定の探索範囲は p≦2、d≦1、q≦2）
2. 市場モデル（ファクター）: 日経平均（^N225）を市場ファクターとする単一ファクターモデル。銘柄の対数リターンを α＋β×市場リターンで回帰し、市場自体の将来値は ARIMA 予測から求める

結果は「月 | ARIMA | ファクター」の表で並べて出力する。

## 非機能要件

- データソースのレート制限対策（取得失敗時はエラーを明示して終了）
- エラー時は取得失敗を明示する

## セットアップ（ローカル実行）

```bash
npm install
npm run build
npm run serve
```

`http://localhost:3000` をブラウザで開く。証券コード（例: 7203）と予測月数を入力して「予測実行」を押す。

## GitHub Pages への公開

1. リポジトリの Settings → Pages → Source で「GitHub Actions」を選択する（「Deploy from a branch」のままだと旧い表示になる）
2. `main`（または `master`）に push すると `.github/workflows/deploy-pages.yml` がビルドし、`site/` の中身をサイトルートとして公開する（`site/index.html` → 公開 URL 直下、`site/js/browser.js` → 公開 URL の `/js/browser.js`）
3. `https://<ユーザ名>.github.io/stock-price-forecast/` を開く（末尾に `/site/` は付けない）。銘柄入力から予測を実行できる


## アプリで出力される内容

- 各月の終値

## 免責事項

本アプリの予想は参考情報であり、投資助言ではない。投資判断は利用者自身の責任で行う。
