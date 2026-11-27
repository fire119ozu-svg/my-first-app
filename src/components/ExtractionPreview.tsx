import { CATEGORY_LABELS } from '../data/checklistItems';
import { getUsageInfo } from '../data/usageCategories';
import { groupByCategory, isSpecifiedBuilding } from '../logic/extractChecklist';
import type { BuildingInfo, ChecklistItem, Severity } from '../types/inspection';

const SEVERITY_LABELS: Record<Severity, string> = { high: '重要', medium: '中', low: '軽' };

interface Props {
  building: BuildingInfo;
  items: ChecklistItem[];
}

/** 抽出結果の確認画面(現場チェック画面の前段) */
export function ExtractionPreview({ building, items }: Props) {
  const groups = groupByCategory(items);
  const usage = getUsageInfo(building.usage);

  return (
    <div className="preview">
      <div className="summary-card">
        <h2>{building.name}</h2>
        <p className="muted">{building.address || '所在地未入力'}</p>
        <dl className="summary-grid">
          <dt>用途</dt>
          <dd>
            {usage.code}項 {usage.label}
            {building.subUsages.length > 0 && `(${building.subUsages.join('・')})`}
          </dd>
          <dt>区分</dt>
          <dd>{isSpecifiedBuilding(building) ? '特定防火対象物' : '非特定防火対象物'}</dd>
          <dt>規模</dt>
          <dd>
            {building.totalFloorArea.toLocaleString()}㎡ / 地上{building.floorsAbove}階
            {building.floorsBelow > 0 && `・地下${building.floorsBelow}階`} / {building.capacity}人
          </dd>
        </dl>
        <p className="total">該当項目 <strong>{items.length}</strong> 件</p>
      </div>

      <p className="disclaimer">
        抽出結果は主要な設置基準を簡略化した判定による確認候補です。構造による緩和・階ごとの判定・免除特例は含みません。
      </p>

      {groups.map((g) => (
        <section key={g.category} className="section">
          <h2 className="section-title">
            {CATEGORY_LABELS[g.category]}
            <span className="count">{g.items.length}</span>
          </h2>
          <ul className="item-list">
            {g.items.map((item) => (
              <li key={item.id}>
                <details>
                  <summary>
                    <span className={`sev sev-${item.severity}`}>{SEVERITY_LABELS[item.severity]}</span>
                    <span className="item-title">{item.title}</span>
                  </summary>
                  <div className="item-detail">
                    <p>{item.checkPoint}</p>
                    <ul className="legal">
                      {item.legalBasis.map((l) => (
                        <li key={l.law + l.article}>
                          {l.law} {l.article}
                          {!l.verified && <span className="unverified">条番号要確認</span>}
                        </li>
                      ))}
                    </ul>
                    {item.note && <p className="note">{item.note}</p>}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
