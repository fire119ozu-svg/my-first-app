import { useEffect, useState } from 'react';
import { canShareFile, createXlsxFile, downloadFile, shareFile } from '../export/exportXlsx';
import type { InspectionCase } from '../types/inspection';

interface Props {
  data: InspectionCase;
  pendingCount: number;
  onClose: () => void;
}

type State =
  | { kind: 'building' }
  | { kind: 'ready'; file: File }
  | { kind: 'error'; message: string };

/**
 * Excel出力パネル。
 * 開いた時点でファイルを生成しておき、ボタン押下で即座に共有・保存する
 * (Safariは非同期処理を挟むと共有シートの表示を拒否するため)。
 */
export function ExportSheet({ data, pendingCount, onClose }: Props) {
  const [state, setState] = useState<State>({ kind: 'building' });
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    createXlsxFile(data).then(
      (file) => !cancelled && setState({ kind: 'ready', file }),
      (e: unknown) => !cancelled && setState({ kind: 'error', message: String(e) }),
    );
    return () => {
      cancelled = true;
    };
    // 開いた時点の内容で生成する(パネル表示中は画面操作できないため内容は変わらない)
  }, []);

  const share = async (file: File) => {
    try {
      if (await shareFile(file)) setMessage('共有しました。');
    } catch (e) {
      setMessage(`共有できませんでした(${String(e)})。「ダウンロード」をお試しください。`);
    }
  };

  const download = (file: File) => {
    downloadFile(file);
    setMessage('ダウンロードを開始しました。「ファイル」アプリの「ダウンロード」に保存されます。');
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="export-title">Excel出力</h2>

        {pendingCount > 0 && (
          <p className="sheet-warn">未判定の項目が {pendingCount} 件あります(「未判定」として出力されます)。</p>
        )}

        {state.kind === 'building' && <p className="muted">ファイルを作成中…</p>}
        {state.kind === 'error' && <p className="error-banner">作成できませんでした:{state.message}</p>}
        {state.kind === 'ready' && (
          <>
            <div className="file-card">
              <span className="file-icon" aria-hidden="true">XLSX</span>
              <span className="file-meta">
                <span className="file-name">{state.file.name}</span>
                <small>{Math.max(1, Math.round(state.file.size / 1024))} KB ・ チェックリスト・指摘事項ほか</small>
              </span>
            </div>
            <div className="sheet-actions">
              {canShareFile(state.file) && (
                <button type="button" className="primary-btn wide" onClick={() => void share(state.file)}>
                  共有・「ファイル」に保存
                </button>
              )}
              <button type="button" className="secondary-btn wide" onClick={() => download(state.file)}>
                ダウンロード
              </button>
            </div>
          </>
        )}

        {message && <p className="sheet-message">{message}</p>}
        <p className="muted small">ファイルは端末内で作成され、外部へは送信されません。</p>

        <button type="button" className="text-btn wide" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
