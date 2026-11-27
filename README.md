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
  types/inspection.ts      型定義(対象物情報・チェック項目・適用条件・案件)
  data/usageCategories.ts  令別表第一の用途区分
  data/checklistItems.ts   チェック項目マスタ(消防法令・高知市火災予防条例)
  App.tsx / main.tsx       画面(実装中)
```

予定:`src/logic/`(項目抽出)、`src/storage/`(IndexedDB保存)、`src/export/`(xlsx出力)、`src/components/`(画面)。

## 開発

```sh
npm install
npm run dev      # 同一LANのiPhoneから http://<PCのIP>:5173 で確認
npm run build    # dist/ を静的ホスティングに配置
```

PWAとしてホーム画面に追加するにはHTTPSで配信する必要がある(GitHub Pages 等)。

## チェック項目マスタについて

適用条件は主要な設置基準を簡略化したもので、構造による面積緩和・階ごとの判定・免除特例は含まない。
抽出結果は確認候補として扱うこと。高知市火災予防条例の条番号は火災予防条例(例)の構成に準拠しており、
`verified: false` のものは高知市例規集で照合してから運用すること。
