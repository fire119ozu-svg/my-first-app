/**
 * 項目ごとの添付写真(縮小表示・追加・拡大表示・削除)。
 */
import { useEffect, useRef, useState } from 'react';
import { getPhoto } from '../storage/caseStore';
import type { PhotoRecord } from '../types/inspection';

/** 保存済み写真を読み込み、表示用URLを返す(不要になったら解放) */
function usePhotoUrl(id: string, kind: 'thumb' | 'blob'): { url: string | null; photo: PhotoRecord | null; missing: boolean } {
  const [state, setState] = useState<{ url: string | null; photo: PhotoRecord | null; missing: boolean }>({
    url: null,
    photo: null,
    missing: false,
  });
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    void getPhoto(id).then((p) => {
      if (cancelled) return;
      if (!p) return setState({ url: null, photo: null, missing: true });
      url = URL.createObjectURL(p[kind]);
      setState({ url, photo: p, missing: false });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, kind]);
  return state;
}

function Thumb({ id, index, onOpen }: { id: string; index: number; onOpen: () => void }) {
  const { url, missing } = usePhotoUrl(id, 'thumb');
  return (
    <button type="button" className="photo-thumb" onClick={onOpen} aria-label={`写真${index + 1}を拡大`}>
      {url ? <img src={url} alt="" /> : <span className="photo-missing">{missing ? '読込不可' : ''}</span>}
    </button>
  );
}

interface StripProps {
  title: string;
  photoIds: string[];
  readOnly: boolean;
  /** 処理中の枚数 */
  pending: number;
  onAdd: (files: File[]) => void;
  onRemove: (photoId: string) => void;
}

export function PhotoStrip({ title, photoIds, readOnly, pending, onAdd, onRemove }: StripProps) {
  const input = useRef<HTMLInputElement>(null);
  const [viewing, setViewing] = useState<number | null>(null);

  if (readOnly && photoIds.length === 0) return null;

  return (
    <div className="photo-strip">
      {photoIds.map((id, i) => (
        <Thumb key={id} id={id} index={i} onOpen={() => setViewing(i)} />
      ))}
      {Array.from({ length: pending }, (_, i) => (
        <span key={`p${i}`} className="photo-thumb pending" aria-label="写真を処理中">
          <span className="spinner" />
        </span>
      ))}
      {!readOnly && (
        <>
          <button
            type="button"
            className="photo-add"
            onClick={() => input.current?.click()}
            aria-label={`${title}に写真を追加`}
          >
            <span aria-hidden="true">＋</span>
            写真
          </button>
          {/* capture を付けないことで、iPhoneでは「写真を撮る/ライブラリ/ファイル」を選べる */}
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              if (files.length) onAdd(files);
            }}
          />
        </>
      )}
      {viewing !== null && photoIds[viewing] && (
        <PhotoViewer
          title={title}
          photoIds={photoIds}
          index={viewing}
          readOnly={readOnly}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
          onRemove={(id) => {
            onRemove(id);
            const rest = photoIds.length - 1;
            setViewing(rest === 0 ? null : Math.min(viewing, rest - 1));
          }}
        />
      )}
    </div>
  );
}

function PhotoViewer(props: {
  title: string;
  photoIds: string[];
  index: number;
  readOnly: boolean;
  onIndex: (i: number) => void;
  onClose: () => void;
  onRemove: (id: string) => void;
}) {
  const { title, photoIds, index, readOnly, onIndex, onClose, onRemove } = props;
  const id = photoIds[index];
  const { url, photo } = usePhotoUrl(id, 'blob');
  const count = photoIds.length;

  // 拡大表示中は背面のスクロールを止める
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label={`${title}の写真`}>
      <div className="viewer-bar">
        <span>
          {title} 写真 {index + 1}/{count}
          {photo && <small>{new Date(photo.createdAt).toLocaleString('ja-JP')}</small>}
        </span>
        <button type="button" className="viewer-btn" onClick={onClose}>
          閉じる
        </button>
      </div>
      <div className="viewer-image" onClick={onClose}>
        {url && <img src={url} alt={`${title} 写真${index + 1}`} onClick={(e) => e.stopPropagation()} />}
      </div>
      <div className="viewer-bar bottom">
        <button type="button" className="viewer-btn" disabled={index === 0} onClick={() => onIndex(index - 1)}>
          ‹ 前
        </button>
        {!readOnly && (
          <button
            type="button"
            className="viewer-btn danger"
            onClick={() => {
              if (confirm('この写真を削除しますか?')) onRemove(id);
            }}
          >
            削除
          </button>
        )}
        <button type="button" className="viewer-btn" disabled={index >= count - 1} onClick={() => onIndex(index + 1)}>
          次 ›
        </button>
      </div>
    </div>
  );
}
