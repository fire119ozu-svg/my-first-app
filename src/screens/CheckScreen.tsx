import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ExportSheet } from '../components/ExportSheet';
import { Header, HeaderLink } from '../components/Header';
import { CATEGORY_LABELS, getChecklistItem } from '../data/checklistItems';
import { groupByCategory } from '../logic/extractChecklist';
import { asPerFloor, asText, floorKeys, floorLabel, sumPerFloor } from '../logic/floors';
import { caseProgress, setRemarks, setStatus, updateEntry, updateEntryField } from '../logic/inspectionCase';
import { paths } from '../router';
import { getCase, saveCase } from '../storage/caseStore';
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

const SEVERITY_LABELS: Record<Severity, string> = { high: '重要', medium: '中', low: '軽' };
const RESULTS: CheckResult[] = ['compliant', 'nonCompliant', 'notApplicable'];

type Filter = 'all' | 'pending' | 'nonCompliant';
type SaveState = 'saved' | 'saving' | 'error';

export function CheckScreen({ caseId }: { caseId: string }) {
  const [data, setData] = useState<InspectionCase | null | undefined>(undefined);
  const [filter, setFilter] = useState<Filter>('all');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [exporting, setExporting] = useState(false);
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
    (itemId: string, result: CheckResult | null) => commit((c) => updateEntry(c, itemId, { result })),
    [commit],
  );
  const onMemo = useCallback(
    (itemId: string, memo: string) => commit((c) => updateEntry(c, itemId, { memo })),
    [commit],
  );

  const onField = useCallback(
    (itemId: string, key: string, value: ItemFieldValue) =>
      commit((c) => updateEntryField(c, itemId, key, value)),
    [commit],
  );

  const floorsAbove = data?.building.floorsAbove ?? 0;
  const floorsBelow = data?.building.floorsBelow ?? 0;
  const floors = useMemo(() => floorKeys({ floorsAbove, floorsBelow }), [floorsAbove, floorsBelow]);

  const items = useMemo(
    () =>
      (data?.itemIds ?? [])
        .map((id) => getChecklistItem(id))
        .filter((i): i is ChecklistItem => i !== undefined),
    [data?.itemIds],
  );

  if (data === undefined) return null;
  if (data === null) {
    return (
      <>
        <Header title="案件" left={<HeaderLink href={paths.list()}>‹ 一覧</HeaderLink>} />
        <main className="app-main"><p className="error-banner">案件が見つかりません。</p></main>
      </>
    );
  }

  const readOnly = data.status === 'completed';
  const progress = caseProgress(data, items.map((i) => i.id));
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  const visible = items.filter((i) => {
    const r = data.entries[i.id]?.result ?? null;
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
        title={data.building.name}
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
        {saveState === 'error' && (
          <p className="error-banner">端末への保存に失敗しました。空き容量を確認してください。</p>
        )}

        <div className="filter-bar">
          <div className="segmented three" role="radiogroup" aria-label="表示">
            {(
              [
                ['all', `すべて ${progress.total}`],
                ['pending', `未判定 ${progress.total - progress.done}`],
                ['nonCompliant', `否 ${progress.nonCompliant}`],
              ] as [Filter, string][]
            ).map(([v, label]) => (
              <button key={v} type="button" role="radio" aria-checked={filter === v} className={`seg${filter === v ? ' on' : ''}`} onClick={() => setFilter(v)}>
                {label}
              </button>
            ))}
          </div>
          <nav className="category-nav" aria-label="カテゴリ">
            {groupByCategory(items).map((g) => {
              const p = caseProgress(data, g.items.map((i) => i.id));
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
                key={item.id}
                item={item}
                entry={data.entries[item.id]}
                floors={floors}
                readOnly={readOnly}
                onResult={onResult}
                onMemo={onMemo}
                onField={onField}
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

      <footer className="action-bar">
        <span className="action-count">
          進捗 <strong>{pct}</strong>%
        </span>
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
  item: ChecklistItem;
  entry: CheckEntry | undefined;
  floors: FloorKey[];
  readOnly: boolean;
  onResult: (itemId: string, result: CheckResult | null) => void;
  onMemo: (itemId: string, memo: string) => void;
  onField: (itemId: string, key: string, value: ItemFieldValue) => void;
}

/** 1項目ぶんのカード。判定ボタンは再タップで未判定に戻せる。 */
const CheckItemCard = memo(function CheckItemCard({ item, entry, floors, readOnly, onResult, onMemo, onField }: CardProps) {
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
            onClick={() => onResult(item.id, result === r ? null : r)}
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
          onChange={(v) => onField(item.id, def.key, v)}
        />
      ))}
      <AutoTextarea
        className="memo"
        value={entry?.memo ?? ''}
        disabled={readOnly}
        ariaLabel={`${item.title}のメモ`}
        placeholder={result === 'nonCompliant' ? '指摘内容・是正指導の内容' : 'メモ'}
        onChange={(v) => onMemo(item.id, v)}
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
