# 消防立入検査チェックリスト作成ツール

iPhone(Safari / PWA)向けの、完全ローカル動作する消防立入検査チェックリスト作成ツール。

- 外部サーバーへのデータ送信なし(案件データは端末内に保存)
- オフライン動作(Service Workerで全アセットをプリキャッシュ)
- ホーム画面に追加してアプリとして使用可能
- チェック結果を端末内でExcel(.xlsx)に変換してダウンロード(ExcelJS)

## 技術構成

Vite + React + TypeScript / vite-plugin-pwa / ExcelJS

## ディレクトリ構成

```
src/
  types/inspection.ts       型定義(対象物情報・チェック項目・適用条件・案件)
  data/                     用途区分・チェック項目マスタ・表示ラベル
  logic/extractChecklist.ts 適用条件の評価とチェック項目の抽出
  logic/buildingForm.ts     入力フォームの状態と検証
  logic/inspectionCase.ts   案件の生成・判定入力・再抽出・進捗
  storage/caseStore.ts      案件の端末内保存(IndexedDB)
  screens/                  案件一覧・対象物入力/編集・現場チェック
  components/               フォーム部品・ヘッダー
  export/                   Excel(.xlsx)出力(ExcelJS、端末内で生成)
  router.ts                 ハッシュルーティング(#/ , #/new , #/case/:id , #/case/:id/edit)
```

## Excel出力

現場チェック画面の「Excel出力」から、端末内で .xlsx を生成する。
iPhoneでは「共有・「ファイル」に保存」で共有シート(ファイルに保存・AirDrop・メール等)を開く。

| シート | 内容 |
|---|---|
| チェックリスト | 案件情報・判定集計・全項目(判定/記録事項/メモ)・備考。A4横・見出し行を各ページに印刷 |
| 指摘事項 | 判定「否」の項目のみ |
| 階別記録 | 消火器の能力単位など階ごとの入力がある場合のみ。合計はSUM式 |
| 対象物情報 | 入力した対象物情報と各種届出の状況 |

ExcelJS(約0.9MB)は出力時に遅延読み込みし、Service Workerでプリキャッシュするためオフラインでも出力できる。

## データの保存について

案件は端末のブラウザ内(IndexedDB)にのみ保存される。判定・メモは入力のたびに即時保存する。
Safariはホーム画面に追加していないサイトのデータを一定期間未使用で削除することがあるため、
現場ではホーム画面に追加したアプリから利用すること。

## 開発

```sh
npm install
npm run dev      # 同一LANのiPhoneから http://<PCのIP>:5173 で確認
npm run build    # dist/ を静的ホスティングに配置
npm test         # 単体テスト(vitest)
```

PWAとしてホーム画面に追加するにはHTTPSで配信する必要がある(GitHub Pages 等)。

## GitHub Pages での公開

`.github/workflows/deploy.yml` により、`main` ブランチへの push でテスト → ビルド → 公開が自動で行われる
(Actions タブの「Deploy to GitHub Pages」から手動実行も可能)。

初回のみ:

1. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にする
2. 作業ブランチを `main` にマージする

公開URL: `https://<ユーザー名>.github.io/<リポジトリ名>/`

iPhoneでは Safari で公開URLを開き、共有ボタン →「ホーム画面に追加」。
一度開けば以降はオフラインでも起動できる。更新は次回オンラインで起動したときに自動で反映される。

> 公開されるのはアプリ本体(プログラムとチェック項目マスタ)のみ。案件データは各端末内にだけ保存され、サーバーには送信されない。
> 非公開(private)リポジトリで GitHub Pages を使うには有料プラン(GitHub Pro 等)が必要で、その場合も公開したサイト自体は誰でも閲覧できる。

## チェック項目マスタについて

適用条件は主要な設置基準を簡略化したもので、構造による面積緩和・階ごとの判定・免除特例は含まない。
抽出結果は確認候補として扱うこと。高知市火災予防条例の条番号は火災予防条例(例)の構成に準拠しており、
`verified: false` のものは高知市例規集で照合してから運用すること。
