import { CATEGORY_LABELS, CATEGORY_ORDER, CHECKLIST_ITEMS } from './data/checklistItems';

/**
 * 仮のトップ画面。対象物入力・抽出・現場チェック・Excel出力は次のステップで実装する。
 */
export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>消防立入検査チェックリスト</h1>
      </header>
      <main className="app-main">
        <p className="muted">チェック項目マスタ:{CHECKLIST_ITEMS.length}件</p>
        <ul className="category-list">
          {CATEGORY_ORDER.map((cat) => (
            <li key={cat}>
              <span>{CATEGORY_LABELS[cat]}</span>
              <span className="count">
                {CHECKLIST_ITEMS.filter((i) => i.category === cat).length}
              </span>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
