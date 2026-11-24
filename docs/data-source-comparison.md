# 株価データ取得ライブラリ比較

対象: コンソール版（TypeScript、Node.js最新）での日本株取得。

## 決定

- 採用: `yahoo-finance2`
- 予備: Stooq（鍵要化のため後回し）
- 除外: J-Quants API（制約が大きく使いづらいため）

## 比較表

| 観点 | yahoo-finance2 | Stooq | J-Quants API |
| --- | --- | --- | --- |
| 公式性 | 非公式 | 非公式 | 東証公式 |
| 料金 | 無料 | 無料 | 無料〜月16500円 |
| 鮮度 | ほぼ当日 | ほぼ当日 | 無料は12週遅延 |
| 日本株 | 対応可 | 対応可 | 東証網羅 |
| TS導入 | npmで楽 | fetchでCSV取得 | fetchで直叩き |
| 安定性 | 仕様変更に弱い | 自動取得が不安定 | 高い |
| 制約 | 制限不明 | 個人利用、鍵要化 | 個人利用、5回/分 |
| 判定 | 採用 | 予備 | 除外 |

## 除外・予備の理由

### J-Quants API（除外）

無料プランは12週間遅延・1分5回・個人利用のみで、直近予想用途に合わないため候補から外す。

### Stooq（予備）

無料CSVだが鍵・CAPTCHA化が進み自動取得が不安定との報告がある。鍵が必要なら導入が楽な yahoo-finance2 が良いため、主軸にしない。

### yahoo-finance2（採用）

無料で直近値が取れ、TypeScript導入が最も楽。非公式のため仕様変更 risk は残るが、コンソール試作の初手に最適。v2は保守終了のため v4（`chart` API使用）で実装。

## 参考

- [yahoo-finance2](https://github.com/gadicc/yahoo-finance2)
- [Stooq API profile](https://apis.io/providers/stooq/)
- [JPX プレスリリース](https://www.jpx.co.jp/corporate/news/news-releases/6020/20250822-01.html)
