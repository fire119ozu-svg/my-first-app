import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ExportSheet } from '../components/ExportSheet';
import { PhotoStrip } from '../components/PhotoStrip';
import { ReferenceSheet } from '../components/ReferenceSheet';
import { Header, HeaderLink } from '../components/Header';
import { CATEGORY_LABELS, getChecklistItem } from '../data/checklistItems';
import { groupByCategory } from '../logic/extractChecklist';
import { asPerFloor, asText, floorKeys, floorLabel, sumPerFloor } from '../logic/floors';
import { getUsageInfo } from '../data/usageCategories';
import {
  addEntryPhoto,
  buildingName,
  caseProgress,
  checklistOf,
  entryKey,
  newId,
  removeEntryPhoto,
  setPhotoCaption,
  setRemarks,
  setStatus,
  updateEntry,
  updateEntryField,
} from '../logic/inspectionCase';
import { processImage } from '../photos/processImage';
import { paths } from '../router';
import { deletePhoto, getCase, saveCase, savePhoto } from '../storage/caseStore';
import {
  CHECK_RESULT_LABELS,
  type CheckEntry,
  type CheckResult,
  type ChecklistItem,
  type FloorKey,
  type InspectionCase,
  type ItemFieldDef,
  type ItemFieldValue,
  type Severity,
} from '../types/inspection';

const NO_PHOTOS: string[] = [];
const NO_CAPTIONS: Record<string, string> = {};

function photoErrorMessage(e: unknown): string {
  if (e instanceof DOMException && e.name === 'QuotaExceededError') {
    return '端末の空き容量が不足しているため写真を保存できませんでした。';
  }
  return `写真を追加できませんでした(${e instanceof Error ? e.message : String(e)})`;
}

const SEVERITY_LABELS: Record<Severity, string> = { high: '重要', medium: '中', low: '軽' };
const RESULTS: CheckResult[] = ['compliant', 'nonCompliant', 'notApplicable'];

type Filter = 'all' | 'pending' | 'nonCompliant';
type SaveState = 'saved' | 'saving' | 'error';

export function CheckScreen({ caseId }: { caseId: string }) {
  const [data, setData] = useState<InspectionCase | null | undefined>(undefined);
  const [filter, setFilter] = useState<Filter>('all');
  /** 表示中の棟(複数棟の場合) */
  const [activeBuilding, setActiveBuilding] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [exporting, setExporting] = useState(false);
  const [showingRefs, setShowingRefs] = useState(false);
  /** 項目ごとの処理中の写真枚数 */
  const [pendingPhotos, setPendingPhotos] = useState<Record<string, number>>({});
  const [photoError, setPhotoError] = useState<string | null>(null);
  const current = useRef<InspectionCase | null>(null);
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    void getCase(caseId).then((c) => {
      current.current = c ?? null;
      setData(c ?? null);
    });
  }, [caseId]);

  /** 変更を即時に端末へ保存する(順序を保つため直列化) */
  const commit = useCallback((update: (c: InspectionCase) => InspectionCase) => {
    if (!current.current) return;
    const next = update(current.current);
    current.current = next;
    setData(next);
    setSaveState('saving');
    saveChain.current = saveChain.current
      .then(() => saveCase(next))
      .then(
        () => {
          if (current.current === next) setSaveState('saved');
        },
        () => setSaveState('error'),
      );
  }, []);

  const onResult = useCallback(
    (key: string, result: CheckResult | null) => commit((c) => updateEntry(c, key, { result })),
    [commit],
  );
  const onMemo = useCallback(
    (key: string, memo: string) => commit((c) => updateEntry(c, key, { memo })),
    [commit],
  );

  const onField = useCallback(
    (key: string, fieldKey: string, value: ItemFieldValue) =>
      commit((c) => updateEntryField(c, key, fieldKey, value)),
    [commit],
  );

  const onAddPhotos = useCallback(
    async (key: string, files: File[]) => {
      const caseId = current.current?.id;
      if (!caseId) return;
      setPhotoError(null);
      const bump = (n: number) =>
        setPendingPhotos((p) => ({ ...p, [key]: Math.max(0, (p[key] ?? 0) + n) }));
      bump(files.length);
      // 端末のメモリを圧迫しないよう1枚ずつ処理する
      for (const file of files) {
        try {
          const img = await processImage(file);
          const id = newId();
          await savePhoto({ id, caseId, itemId: key, ...img, createdAt: new Date().toISOString() });
          commit((c) => addEntryPhoto(c, key, id));
        } catch (e) {
          setPhotoError(photoErrorMessage(e));
        } finally {
          bump(-1);
        }
      }
    },
    [commit],
  );

  const onRemovePhoto = useCallback(
    (key: string, photoId: string) => {
      commit((c) => removeEntryPhoto(c, key, photoId));
      // 案件側から外した後に本体を消す(失敗しても表示には影響しない)
      void deletePhoto(photoId).catch(() => undefined);
    },
    [commit],
  );

  const onPhotoCaption = useCallback(
    (key: string, photoId: string, caption: string) =>
      commit((c) => setPhotoCaption(c, key, photoId, caption)),
    [commit],
  );

  const bIndex = Math.min(activeBuilding, Math.max(0, (data?.buildings.length ?? 1) - 1));
  const building = data?.buildings[bIndex];
  const floorsAbove = building?.floorsAbove ?? 0;
  const floorsBelow = building?.floorsBelow ?? 0;
  const floors = useMemo(() => floorKeys({ floorsAbove, floorsBelow }), [floorsAbove, floorsBelow]);

  const itemIds = data && building ? checklistOf(data, building.id) : NO_PHOTOS;
  const items = useMemo(
    () => itemIds.map((id) => getChecklistItem(id)).filter((i): i is ChecklistItem => i !== undefined),
    [itemIds],
  );

  if (data === undefined) return null;
  if (data === null || !building) {
    return (
      <>
        <Header title="案件" left={<HeaderLink href={paths.list()}>‹ 一覧</HeaderLink>} />
        <main className="app-main"><p className="error-banner">案件が見つかりません。</p></main>
      </>
    );
  }

  const readOnly = data.status === 'completed';
  const keyOf = (itemId: string) => entryKey(building.id, itemId);
  // ヘッダーは案件全体(全棟)、絞り込み・カテゴリは表示中の棟
  const progress = caseProgress(data);
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const bProgress = caseProgress(data, items.map((i) => keyOf(i.id)));
  const multi = data.buildings.length > 1;
  const usage = getUsageInfo(building.usage);

  const visible = items.filter((i) => {
    const r = data.entries[keyOf(i.id)]?.result ?? null;
    if (filter === 'pending') return r === null;
    if (filter === 'nonCompliant') return r === 'nonCompliant';
    return true;
  });
  const groups = groupByCategory(visible);

  const complete = () => {
    const pending = progress.total - progress.done;
    const msg = pending > 0
      ? `未判定の項目が ${pending} 件あります。検査を完了にしますか?`
      : '検査を完了にしますか?';
    if (confirm(msg)) commit((c) => setStatus(c, 'completed'));
  };

  return (
    <>
      <Header
        title={data.site.name}
        left={<HeaderLink href={paths.list()}>‹ 一覧</HeaderLink>}
        right={!readOnly && <HeaderLink href={paths.edit(data.id)}>編集</HeaderLink>}
      >
        <div className="check-subheader">
          <div className="progress light" aria-label={`進捗 ${pct}%`}>
            <div className="progress-bar" style={{ width: `${pct}%` }} />
          </div>
          <div className="check-stats">
            <span>{progress.done}/{progress.total} 判定</span>
            <span>適 {progress.compliant}</span>
            <span className="ng-light">否 {progress.nonCompliant}</span>
            <span>該当なし {progress.notApplicable}</span>
            <span className={`save-state ${saveState}`}>
              {saveState === 'saved' ? '保存済み' : saveState === 'saving' ? '保存中…' : '保存失敗'}
            </span>
          </div>
        </div>
      </Header>

      <main className="app-main check-main">
        {readOnly && (
          <div className="completed-banner">
            <span>この案件は完了済みです(閲覧のみ)</span>
            <button type="button" onClick={() => commit((c) => setStatus(c, 'inspecting'))}>
              再開
            </button>
          </div>
        )}
        {photoError && (
          <p className="error-banner" role="alert" onClick={() => setPhotoError(null)}>
            {photoError}
          </p>
        )}
        {saveState === 'error' && (
          <p className="error-banner">端末への保存に失敗しました。空き容量を確認してください。</p>
        )}

        {multi && (
          <div className="building-tabs check-building-tabs" role="tablist" aria-label="棟">
            {data.buildings.map((b, i) => {
              const p = caseProgress(data, checklistOf(data, b.id).map((id) => entryKey(b.id, id)));
              return (
                <button
                  key={b.id}
                  type="button"
                  role="tab"
                  aria-selected={i === bIndex}
                  className={`chip${i === bIndex ? ' on' : ''}${p.total > 0 && p.done === p.total ? ' done' : ''}`}
                  onClick={() => {
                    setActiveBuilding(i);
                    window.scrollTo(0, 0);
                  }}
                >
                  {buildingName(b, i)} {p.done}/{p.total}
                </button>
              );
            })}
          </div>
        )}
        <p className="building-summary">
          {multi && <strong>{buildingName(building, bIndex)}:</strong>}
          {usage.code}項 {usage.label}
          {building.subUsages.length > 0 && `(${building.subUsages.map((u) => `${u}項`).join('・')})`}・
          {building.totalFloorArea.toLocaleString('ja-JP')}㎡・地上{building.floorsAbove}階
          {building.floorsBelow > 0 && `地下${building.floorsBelow}階`}・{building.capacity}人
        </p>

        <div className="filter-bar">
          <div className="segmented three" role="radiogroup" aria-label="表示">
            {(
              [
                ['all', `すべて ${bProgress.total}`],
                ['pending', `未判定 ${bProgress.total - bProgress.done}`],
                ['nonCompliant', `否 ${bProgress.nonCompliant}`],
              ] as [Filter, string][]
            ).map(([v, label]) => (
              <button key={v} type="button" role="radio" aria-checked={filter === v} className={`seg${filter === v ? ' on' : ''}`} onClick={() => setFilter(v)}>
                {label}
              </button>
            ))}
          </div>
          <nav className="category-nav" aria-label="カテゴリ">
            {groupByCategory(items).map((g) => {
              const p = caseProgress(data, g.items.map((i) => keyOf(i.id)));
              return (
                <a
                  key={g.category}
                  href={`#cat-${g.category}`}
                  className={`cat-chip${p.done === p.total ? ' done' : ''}`}
                  onClick={(e) => {
                    // ハッシュルーティングと衝突しないようスクロールのみ行う
                    e.preventDefault();
                    document.getElementById(`cat-${g.category}`)?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  {CATEGORY_LABELS[g.category]} {p.done}/{p.total}
                </a>
              );
            })}
          </nav>
        </div>

        {groups.length === 0 && <p className="muted center">該当する項目はありません。</p>}

        {groups.map((g) => (
          <section key={g.category} id={`cat-${g.category}`} className="section check-section">
            <h2 className="section-title">{CATEGORY_LABELS[g.category]}</h2>
            {g.items.map((item) => (
              <CheckItemCard
                key={keyOf(item.id)}
                entryKey={keyOf(item.id)}
                item={item}
                entry={data.entries[keyOf(item.id)]}
                floors={floors}
                readOnly={readOnly}
                onResult={onResult}
                onMemo={onMemo}
                onField={onField}
                pendingPhotos={pendingPhotos[keyOf(item.id)] ?? 0}
                onAddPhotos={onAddPhotos}
                onRemovePhoto={onRemovePhoto}
                onPhotoCaption={onPhotoCaption}
              />
            ))}
          </section>
        ))}

        <section className="section">
          <h2 className="section-title">備考(案件全体)</h2>
          <AutoTextarea
            className="remarks"
            value={data.remarks}
            disabled={readOnly}
            placeholder="立会者の説明、是正予定、次回確認事項など"
            onChange={(v) => commit((c) => setRemarks(c, v))}
          />
        </section>
      </main>

      {/* 進捗はヘッダーに表示しているため、下部はボタンのみ */}
      <footer className="action-bar buttons">
        <button type="button" className="secondary-btn" onClick={() => setShowingRefs(true)}>
          参考資料
        </button>
        <button
          type="button"
          className={readOnly ? 'primary-btn' : 'secondary-btn'}
          onClick={() => setExporting(true)}
        >
          Excel出力
        </button>
        {!readOnly && (
          <button type="button" className="primary-btn" onClick={complete}>
            検査完了
          </button>
        )}
      </footer>

      {showingRefs && <ReferenceSheet onClose={() => setShowingRefs(false)} />}

      {exporting && (
        <ExportSheet
          data={data}
          pendingCount={progress.total - progress.done}
          onClose={() => setExporting(false)}
        />
      )}
    </>
  );
}

interface CardProps {
  /** 結果のキー(棟ID:項目ID) */
  entryKey: string;
  item: ChecklistItem;
  entry: CheckEntry | undefined;
  floors: FloorKey[];
  readOnly: boolean;
  onResult: (key: string, result: CheckResult | null) => void;
  onMemo: (key: string, memo: string) => void;
  onField: (key: string, fieldKey: string, value: ItemFieldValue) => void;
  pendingPhotos: number;
  onAddPhotos: (key: string, files: File[]) => void;
  onRemovePhoto: (key: string, photoId: string) => void;
  onPhotoCaption: (key: string, photoId: string, caption: string) => void;
}

/** 1項目ぶんのカード。判定ボタンは再タップで未判定に戻せる。 */
const CheckItemCard = memo(function CheckItemCard({
  entryKey: key,
  item,
  entry,
  floors,
  readOnly,
  onResult,
  onMemo,
  onField,
  pendingPhotos,
  onAddPhotos,
  onRemovePhoto,
  onPhotoCaption,
}: CardProps) {
  const result = entry?.result ?? null;
  return (
    <article className={`check-card${result ? ` r-${result}` : ''}`}>
      <div className="check-card-head">
        <span className={`sev sev-${item.severity}`}>{SEVERITY_LABELS[item.severity]}</span>
        <h3>{item.title}</h3>
        <span className="item-id">{item.id}</span>
      </div>
      <p className="check-point">{item.checkPoint}</p>
      <details className="check-legal">
        <summary>根拠法令{item.note ? '・補足' : ''}</summary>
        <ul className="legal">
          {item.legalBasis.map((l) => (
            <li key={l.law + l.article}>
              {l.law} {l.article}
              {!l.verified && <span className="unverified">条番号要確認</span>}
            </li>
          ))}
        </ul>
        {item.note && <p className="note">{item.note}</p>}
      </details>
      <div className="result-buttons" role="radiogroup" aria-label={`${item.title}の判定`}>
        {RESULTS.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={result === r}
            disabled={readOnly}
            className={`result-btn ${r}${result === r ? ' on' : ''}`}
            onClick={() => onResult(key, result === r ? null : r)}
          >
            {CHECK_RESULT_LABELS[r]}
          </button>
        ))}
      </div>
      {item.fields?.map((def) => (
        <ItemField
          key={def.key}
          def={def}
          value={entry?.fields?.[def.key]}
          floors={floors}
          readOnly={readOnly}
          onChange={(v) => onField(key, def.key, v)}
        />
      ))}
      <PhotoStrip
        title={item.title}
        photoIds={entry?.photoIds ?? NO_PHOTOS}
        captions={entry?.photoCaptions ?? NO_CAPTIONS}
        readOnly={readOnly}
        pending={pendingPhotos}
        onAdd={(files) => onAddPhotos(key, files)}
        onRemove={(id) => onRemovePhoto(key, id)}
        onCaption={(id, caption) => onPhotoCaption(key, id, caption)}
      />
      <AutoTextarea
        className="memo"
        value={entry?.memo ?? ''}
        disabled={readOnly}
        ariaLabel={`${item.title}のメモ`}
        placeholder={result === 'nonCompliant' ? '指摘内容・是正指導の内容' : 'メモ'}
        onChange={(v) => onMemo(key, v)}
      />
    </article>
  );
});

/** 項目ごとの追加入力欄(テキスト/階ごとの数値) */
function ItemField(props: {
  def: ItemFieldDef;
  value: ItemFieldValue | undefined;
  floors: FloorKey[];
  readOnly: boolean;
  onChange: (v: ItemFieldValue) => void;
}) {
  const { def, value, floors, readOnly, onChange } = props;
  const id = useId();

  if (def.kind === 'text') {
    return (
      <div className="item-field">
        <label htmlFor={id} className="item-field-label">{def.label}</label>
        <input
          id={id}
          type="text"
          className="item-field-input"
          value={asText(value)}
          placeholder={def.placeholder}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  const perFloor = asPerFloor(value);
  const sum = sumPerFloor(value, floors);
  return (
    <fieldset className="item-field">
      <legend className="item-field-label">{def.label}</legend>
      {floors.length === 0 ? (
        <p className="muted">階数が未設定です。</p>
      ) : (
        <div className="floor-grid">
          {floors.map((f) => (
            <label key={f} className="floor-row">
              <span className="floor-name">{floorLabel(f)}</span>
              <input
                type="text"
                inputMode={def.decimal ? 'decimal' : 'numeric'}
                className="item-field-input num"
                value={perFloor[f] ?? ''}
                disabled={readOnly}
                aria-label={`${floorLabel(f)}の${def.label}`}
                onChange={(e) => onChange({ ...perFloor, [f]: e.target.value })}
              />
              <span className="unit">{def.unit}</span>
            </label>
          ))}
        </div>
      )}
      <div className="floor-total">
        {sum.invalid > 0 && <span className="field-error">数値でない入力が {sum.invalid} 件あります</span>}
        <span>
          合計 <strong>{sum.total}</strong> {def.unit}
          <small>({sum.filled}/{floors.length}階 入力)</small>
        </span>
      </div>
    </fieldset>
  );
}

/** 入力量に合わせて高さが伸びるテキストエリア */
function AutoTextarea(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      className={props.className}
      value={props.value}
      disabled={props.disabled}
      placeholder={props.placeholder}
      aria-label={props.ariaLabel}
      onChange={(e) => props.onChange(e.target.value)}
    />
  );
}
