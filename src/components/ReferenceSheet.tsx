/**
 * 参考資料(全画面)。利用者がiPhoneに取り込んだPDF・画像を一覧・表示する。
 * 資料は端末内にのみ保存され、外部へは送信されない。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { newId } from '../logic/inspectionCase';
import { processImage } from '../photos/processImage';
import { categoriesOf, describe, groupReferences, kindOf, titleFromFileName, UNCATEGORIZED } from '../references/library';
import { countPdfPages, PdfPasswordError } from '../references/pdf';
import { deleteReference, listReferences, saveReference } from '../storage/caseStore';
import type { ReferenceRecord } from '../types/inspection';
import { DocViewer } from './DocViewer';

/** 文字を読む資料なので写真より大きめに保存する */
const REFERENCE_IMAGE_MAX_EDGE = 2400;

function importErrorMessage(name: string, e: unknown): string {
  if (e instanceof DOMException && e.name === 'QuotaExceededError') {
    return `「${name}」:端末の空き容量が不足しているため保存できませんでした。`;
  }
  if (e instanceof PdfPasswordError) return `「${name}」:${e.message}`;
  return `「${name}」:取り込めませんでした(${e instanceof Error ? e.message : String(e)})`;
}

async function toRecord(file: File): Promise<ReferenceRecord> {
  const kind = kindOf(file);
  if (!kind) throw new Error('PDFまたは画像ファイルを選んでください');
  const now = new Date().toISOString();
  const base = { id: newId(), title: titleFromFileName(file.name), category: '', fileName: file.name, createdAt: now, updatedAt: now };
  if (kind === 'pdf') {
    const pageCount = await countPdfPages(file);
    return { ...base, kind, pageCount, blob: new Blob([file], { type: 'application/pdf' }) };
  }
  const img = await processImage(file, REFERENCE_IMAGE_MAX_EDGE);
  return { ...base, kind, pageCount: 1, blob: img.blob };
}

export function ReferenceSheet({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<ReferenceRecord[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ReferenceRecord | null>(null);
  const [query, setQuery] = useState('');
  const [importing, setImporting] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const reload = () =>
    listReferences()
      .then(setList)
      .catch(() => setErrors(['参考資料を読み込めませんでした。']));
  useEffect(() => {
    void reload();
  }, []);

  // 表示中は背面のスクロールを止める
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const groups = useMemo(() => groupReferences(list ?? [], query), [list, query]);
  const categories = useMemo(() => categoriesOf(list ?? []), [list]);
  const doc = list?.find((r) => r.id === openId) ?? null;

  const importFiles = async (files: File[]) => {
    setErrors([]);
    setImporting(files.length);
    const added: ReferenceRecord[] = [];
    const errs: string[] = [];
    // 端末のメモリを圧迫しないよう1件ずつ処理する
    for (const f of files) {
      try {
        const r = await toRecord(f);
        await saveReference(r);
        added.push(r);
      } catch (e) {
        errs.push(importErrorMessage(f.name, e));
      } finally {
        setImporting((n) => n - 1);
      }
    }
    setErrors(errs);
    await reload();
    // 1件だけ取り込んだ場合は、続けて表題・分類を設定できるようにする
    if (added.length === 1) setEditing(added[0]);
  };

  const saveEdit = async (r: ReferenceRecord, title: string, category: string) => {
    await saveReference({ ...r, title: title.trim() || r.title, category: category.trim(), updatedAt: new Date().toISOString() });
    setEditing(null);
    await reload();
  };

  const remove = async (r: ReferenceRecord) => {
    if (!confirm(`「${r.title}」を削除しますか?\nこの端末から資料が削除されます。`)) return;
    await deleteReference(r.id);
    setEditing(null);
    if (openId === r.id) setOpenId(null);
    await reload();
  };

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

      {doc ? (
        <DocViewer key={doc.id} doc={doc} />
      ) : (
        <div className="ref-body">
          <button type="button" className="primary-btn wide" onClick={() => input.current?.click()} disabled={importing > 0}>
            {importing > 0 ? `取り込み中…(残り${importing}件)` : '＋ 資料を追加(PDF・画像)'}
          </button>
          {/* iPhoneでは「ファイル」アプリ・写真ライブラリ・カメラから選べる */}
          <input
            ref={input}
            type="file"
            accept="application/pdf,.pdf,image/*"
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              if (files.length) void importFiles(files);
            }}
          />
          <p className="muted small ref-note">資料はこの端末内にだけ保存され、外部には送信されません。</p>

          {errors.map((m) => (
            <p key={m} className="error-banner" role="alert">
              {m}
            </p>
          ))}

          {list && list.length > 5 && (
            <input
              type="search"
              className="ref-search"
              placeholder="資料を検索(表題・分類)"
              aria-label="資料を検索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}

          {list?.length === 0 && (
            <div className="empty">
              <p>参考資料はまだありません。</p>
              <p className="muted">「資料を追加」から、iPhoneの「ファイル」アプリや写真にあるPDF・画像を取り込めます。</p>
            </div>
          )}
          {list && list.length > 0 && groups.length === 0 && <p className="muted center">該当する資料はありません。</p>}

          {groups.map(([category, items]) => (
            <section key={category} className="section">
              <h3 className="section-title">{category}</h3>
              <ul className="ref-list">
                {items.map((r) => (
                  <li key={r.id}>
                    <button type="button" className="ref-open" onClick={() => setOpenId(r.id)}>
                      <span className={`ref-kind ${r.kind}`}>{r.kind === 'pdf' ? 'PDF' : '画像'}</span>
                      <span className="ref-text-col">
                        <span className="ref-title">{r.title}</span>
                        <small>{describe(r)}</small>
                      </span>
                    </button>
                    <button type="button" className="ref-edit" onClick={() => setEditing(r)} aria-label={`${r.title}を編集`}>
                      編集
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <EditDialog
          record={editing}
          categories={categories}
          onSave={(t, c) => void saveEdit(editing, t, c)}
          onDelete={() => void remove(editing)}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function EditDialog(props: {
  record: ReferenceRecord;
  categories: string[];
  onSave: (title: string, category: string) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const { record, categories } = props;
  const [title, setTitle] = useState(record.title);
  const [category, setCategory] = useState(record.category);
  return (
    <div className="sheet-backdrop" onClick={props.onCancel}>
      <form
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ref-edit-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          props.onSave(title, category);
        }}
      >
        <h2 id="ref-edit-title">資料の設定</h2>
        <p className="muted small">{record.fileName}・{describe(record)}</p>
        <div className="field">
          <label className="field-label" htmlFor="ref-title">
            表題
          </label>
          <input id="ref-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="ref-category">
            分類
          </label>
          <input
            id="ref-category"
            type="text"
            list="ref-categories"
            value={category}
            placeholder={`例:設置基準(空欄は「${UNCATEGORIZED}」)`}
            onChange={(e) => setCategory(e.target.value)}
          />
          <datalist id="ref-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          {categories.length > 0 && (
            <div className="chips ref-cat-chips">
              {categories.map((c) => (
                <button key={c} type="button" className={`chip${c === category ? ' on' : ''}`} onClick={() => setCategory(c)}>
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="sheet-actions">
          <button type="submit" className="primary-btn wide">
            保存
          </button>
          <button type="button" className="danger-btn" onClick={props.onDelete}>
            この資料を削除
          </button>
        </div>
        <button type="button" className="text-btn wide" onClick={props.onCancel}>
          キャンセル
        </button>
      </form>
    </div>
  );
}
