/**
 * 参考資料の一覧・閲覧(全画面)。資料はアプリに同梱されオフラインでも見られる。
 */
import { useEffect, useMemo, useState } from 'react';
import { REFERENCES, type ReferenceDoc } from '../data/references';

function referenceUrl(file: string): string {
  // GitHub Pages のサブパス配下でも動くよう、ページ基準の相対URLにする
  return new URL(`references/${file}`, document.baseURI).href;
}

export function ReferenceSheet({ onClose, docs = REFERENCES }: { onClose: () => void; docs?: ReferenceDoc[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const doc = docs.find((d) => d.id === openId) ?? null;

  // 表示中は背面のスクロールを止める
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const groups = useMemo(() => {
    const q = query.trim();
    const hit = (d: ReferenceDoc) =>
      !q ||
      [d.title, d.description ?? '', d.category, ...(d.kind === 'text' ? d.sections.flatMap((s) => [s.heading ?? '', s.body]) : [])]
        .join('\n')
        .includes(q);
    const map = new Map<string, ReferenceDoc[]>();
    for (const d of docs.filter(hit)) map.set(d.category, [...(map.get(d.category) ?? []), d]);
    return [...map.entries()];
  }, [docs, query]);

  return (
    <div className="ref-sheet" role="dialog" aria-modal="true" aria-label="参考資料">
      <header className="ref-header">
        {doc ? (
          <button type="button" className="header-btn" onClick={() => setOpenId(null)}>
            ‹ 一覧
          </button>
        ) : (
          <span />
        )}
        <h2>{doc ? doc.title : '参考資料'}</h2>
        <button type="button" className="header-btn" onClick={onClose}>
          閉じる
        </button>
      </header>

      <div className="ref-body">
        {doc ? (
          <ReferenceView doc={doc} />
        ) : docs.length === 0 ? (
          <div className="empty">
            <p>参考資料はまだ登録されていません。</p>
          </div>
        ) : (
          <>
            {docs.length > 5 && (
              <input
                type="search"
                className="ref-search"
                placeholder="資料を検索"
                aria-label="資料を検索"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            )}
            {groups.length === 0 && <p className="muted center">該当する資料はありません。</p>}
            {groups.map(([category, list]) => (
              <section key={category} className="section">
                <h3 className="section-title">{category}</h3>
                <ul className="ref-list">
                  {list.map((d) => (
                    <li key={d.id}>
                      <button type="button" onClick={() => setOpenId(d.id)}>
                        <span className="ref-title">{d.title}</span>
                        {d.description && <small>{d.description}</small>}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function ReferenceView({ doc }: { doc: ReferenceDoc }) {
  if (doc.kind === 'image') {
    return (
      <div className="ref-images">
        {doc.description && <p className="muted">{doc.description}</p>}
        {doc.files.map((f, i) => (
          // 画像をタップすると原寸で開き、ピンチで拡大できる
          <a key={f} href={referenceUrl(f)} target="_blank" rel="noopener">
            <img src={referenceUrl(f)} alt={`${doc.title} ${i + 1}`} loading="lazy" />
          </a>
        ))}
      </div>
    );
  }
  return (
    <article className="ref-text">
      {doc.description && <p className="muted">{doc.description}</p>}
      {doc.sections.map((s, i) => (
        <section key={i}>
          {s.heading && <h3>{s.heading}</h3>}
          <p>{s.body}</p>
        </section>
      ))}
    </article>
  );
}
