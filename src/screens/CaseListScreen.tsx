import { useEffect, useState } from 'react';
import { Header } from '../components/Header';
import { getUsageInfo } from '../data/usageCategories';
import { CASE_STATUS_LABELS, caseProgress } from '../logic/inspectionCase';
import { paths } from '../router';
import { deleteCase, listCases } from '../storage/caseStore';
import type { InspectionCase } from '../types/inspection';

export function CaseListScreen() {
  const [cases, setCases] = useState<InspectionCase[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = () =>
    listCases()
      .then(setCases)
      .catch((e: unknown) => setError(`案件を読み込めませんでした(${String(e)})`));

  useEffect(() => {
    void reload();
  }, []);

  const remove = async (c: InspectionCase) => {
    if (!confirm(`「${c.site.name}」を削除しますか?\nこの操作は取り消せません。`)) return;
    await deleteCase(c.id);
    await reload();
  };

  return (
    <>
      <Header title="立入検査" />
      <main className="app-main">
        {error && <p className="error-banner">{error}</p>}
        {cases === null && !error && <p className="muted center">読み込み中…</p>}
        {cases?.length === 0 && (
          <div className="empty">
            <p>保存された案件はありません。</p>
            <p className="muted">下の「新規案件」から対象物情報を入力してください。</p>
          </div>
        )}
        {cases && cases.length > 0 && (
          <ul className="case-list">
            {cases.map((c) => {
              const p = caseProgress(c);
              const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
              return (
                <li key={c.id} className={`case-row status-${c.status}`}>
                  <a href={paths.check(c.id)} className="case-link">
                    <div className="case-head">
                      <span className="case-name">{c.site.name}</span>
                      <span className={`status-badge ${c.status}`}>{CASE_STATUS_LABELS[c.status]}</span>
                    </div>
                    <div className="case-sub">
                      {c.inspectionDate} ・{' '}
                      {c.buildings.length > 1
                        ? `${c.buildings.length}棟`
                        : `${getUsageInfo(c.buildings[0].usage).code}項`}
                      {c.site.address && ` ・ ${c.site.address}`}
                    </div>
                    <div className="progress" aria-label={`進捗 ${pct}%`}>
                      <div className="progress-bar" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="case-stats">
                      <span>{p.done}/{p.total} 判定</span>
                      {p.nonCompliant > 0 && <span className="ng">否 {p.nonCompliant}</span>}
                    </div>
                  </a>
                  {c.status === 'completed' && (
                    <button type="button" className="row-delete" onClick={() => void remove(c)}>
                      削除
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
      <footer className="action-bar">
        <span className="action-count">
          {cases ? `${cases.length} 件の案件` : ''}
        </span>
        <a className="primary-btn" href={paths.new()}>
          ＋ 新規案件
        </a>
      </footer>
    </>
  );
}
