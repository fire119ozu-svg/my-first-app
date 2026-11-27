import { useEffect, useMemo, useState } from 'react';
import { BuildingForm } from '../components/BuildingForm';
import { Field, Section, TextInput } from '../components/controls';
import { Header, HeaderLink } from '../components/Header';
import { emptyBuildingForm, toBuildingForm, validateBuildingForm, type BuildingFormState } from '../logic/buildingForm';
import { extractChecklistItems } from '../logic/extractChecklist';
import { createCase, parseInspectors, today, updateBuilding } from '../logic/inspectionCase';
import { navigate, paths } from '../router';
import { deleteCase, getCase, saveCase } from '../storage/caseStore';
import type { InspectionCase } from '../types/inspection';

interface MetaForm {
  inspectionDate: string;
  inspectors: string;
}

interface Draft {
  form: BuildingFormState;
  meta: MetaForm;
}

/**
 * 新規入力中の下書きを端末内に退避する(Safariのタブ破棄・再読込対策)。
 * 案件として作成した時点で破棄する。
 */
const DRAFT_KEY = 'newCaseDraft:v1';

/** 旧形式の下書きに含まれていた項目 */
interface LegacyDraft {
  form?: { ownerName?: string };
  meta?: { witness?: string };
}

function emptyDraft(): Draft {
  return { form: emptyBuildingForm(), meta: { inspectionDate: today(), inspectors: '' } };
}

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<Draft> & LegacyDraft;
      const e = emptyDraft();
      const form = { ...e.form, ...d.form };
      // 旧形式の下書き(関係者・立会者が文字列)を移行
      if (d.form?.ownerName && !form.representative.name) form.representative = { title: '', name: d.form.ownerName };
      if (d.meta?.witness && !form.witness.name) form.witness = { title: '', name: d.meta.witness };
      delete (form as { ownerName?: string }).ownerName;
      return { form, meta: { inspectionDate: d.meta?.inspectionDate ?? e.meta.inspectionDate, inspectors: d.meta?.inspectors ?? '' } };
    }
  } catch {
    // 保存領域が使えない環境では空のフォームから開始
  }
  return emptyDraft();
}

function storeDraft(d: Draft | null) {
  try {
    if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // 保存できなくても入力は継続できる
  }
}

export function CaseFormScreen({ caseId }: { caseId?: string }) {
  const isEdit = caseId !== undefined;
  const [existing, setExisting] = useState<InspectionCase | null>(null);
  const [draft, setDraft] = useState<Draft | null>(() => (isEdit ? null : loadDraft()));
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    void getCase(caseId).then((c) => {
      if (!c) return setNotFound(true);
      setExisting(c);
      setDraft({
        form: toBuildingForm(c.building),
        meta: { inspectionDate: c.inspectionDate, inspectors: c.inspectors.join('、') },
      });
    });
  }, [caseId, isEdit]);

  useEffect(() => {
    if (!isEdit && draft) storeDraft(draft);
  }, [draft, isEdit]);

  const validation = useMemo(() => (draft ? validateBuildingForm(draft.form) : null), [draft]);
  const building = validation?.building ?? null;
  const itemCount = useMemo(() => (building ? extractChecklistItems(building).length : 0), [building]);

  if (notFound) {
    return (
      <>
        <Header title="案件" left={<HeaderLink href={paths.list()}>‹ 一覧</HeaderLink>} />
        <main className="app-main"><p className="error-banner">案件が見つかりません。</p></main>
      </>
    );
  }
  if (!draft || !validation) return null;

  const dateError = showErrors && !draft.meta.inspectionDate ? '検査日を入力してください' : undefined;
  const setMeta = (patch: Partial<MetaForm>) => setDraft({ ...draft, meta: { ...draft.meta, ...patch } });

  const submit = async () => {
    if (!building || !draft.meta.inspectionDate) {
      setShowErrors(true);
      requestAnimationFrame(() =>
        document.querySelector('.has-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      );
      return;
    }
    const meta = {
      inspectionDate: draft.meta.inspectionDate,
      inspectors: parseInspectors(draft.meta.inspectors),
    };
    setSaving(true);
    try {
      if (existing) {
        const next = updateBuilding(existing, building, meta);
        const removed = existing.itemIds.filter((id) => !next.itemIds.includes(id)).length;
        const added = next.itemIds.filter((id) => !existing.itemIds.includes(id)).length;
        if ((removed || added) && !confirm(`チェック項目が変わります(追加 ${added} 件・除外 ${removed} 件)。\n入力済みの結果は保持されます。保存しますか?`)) {
          return;
        }
        await saveCase(next);
        navigate(paths.check(existing.id), { replace: true });
      } else {
        const c = createCase(building, meta);
        await saveCase(c);
        storeDraft(null);
        navigate(paths.check(c.id), { replace: true });
      }
    } catch (e) {
      alert(`保存できませんでした:${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const clear = () => {
    if (!confirm('入力内容をすべて消去しますか?')) return;
    setDraft(emptyDraft());
    setShowErrors(false);
  };

  const remove = async () => {
    if (!existing) return;
    if (!confirm(`「${existing.building.name}」を削除しますか?\nこの操作は取り消せません。`)) return;
    await deleteCase(existing.id);
    navigate(paths.list(), { replace: true });
  };

  return (
    <>
      <Header
        title={isEdit ? '対象物情報の編集' : '新規案件'}
        left={<HeaderLink href={isEdit ? paths.check(caseId) : paths.list()}>{isEdit ? '‹ 戻る' : '‹ 一覧'}</HeaderLink>}
        right={
          !isEdit && (
            <button type="button" className="header-btn" onClick={clear}>
              クリア
            </button>
          )
        }
      />
      <main className="app-main">
        <Section title="検査情報">
          <Field label="検査日" required error={dateError}>
            {(id) => (
              <input id={id} type="date" value={draft.meta.inspectionDate} onChange={(e) => setMeta({ inspectionDate: e.target.value })} />
            )}
          </Field>
          <TextInput label="検査員" value={draft.meta.inspectors} onChange={(v) => setMeta({ inspectors: v })} placeholder="複数は「、」で区切る" />
        </Section>

        <BuildingForm
          form={draft.form}
          errors={showErrors ? validation.errors : {}}
          onChange={(form) => setDraft({ ...draft, form })}
        />

        {existing && (
          <button type="button" className="danger-btn" onClick={() => void remove()}>
            この案件を削除
          </button>
        )}
      </main>
      <footer className="action-bar">
        <span className="action-count">
          {building ? (
            <>
              該当 <strong>{itemCount}</strong> 件
            </>
          ) : (
            '必須項目を入力'
          )}
        </span>
        <button type="button" className="primary-btn" onClick={() => void submit()} disabled={saving}>
          {isEdit ? '保存' : '抽出して検査開始'}
        </button>
      </footer>
    </>
  );
}
