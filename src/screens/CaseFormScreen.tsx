import { useEffect, useMemo, useState } from 'react';
import { BuildingForm } from '../components/BuildingForm';
import { Field, PersonInput, Section } from '../components/controls';
import { Header, HeaderLink } from '../components/Header';
import { InspectorsInput } from '../components/InspectorsInput';
import { emptyBuildingForm, toBuildingForm, validateBuildingForm, type BuildingFormState } from '../logic/buildingForm';
import { extractChecklistItems } from '../logic/extractChecklist';
import {
  createCase,
  newId,
  normalizeInspectors,
  parseInspectors,
  RENOVATION_PHOTO_KEY,
  today,
  updateBuilding,
} from '../logic/inspectionCase';
import { processImage } from '../photos/processImage';
import { navigate, paths } from '../router';
import { deleteCase, deletePhoto, deletePhotosByCase, getCase, saveCase, savePhoto } from '../storage/caseStore';
import type { InspectionCase, Inspector } from '../types/inspection';

interface MetaForm {
  inspectionDate: string;
  inspectors: Inspector[];
}

interface Draft {
  /** 案件ID。新規でも下書きの段階で決め、写真をこのIDで保存する */
  caseId: string;
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
  meta?: { witness?: string; inspectors?: string };
}

function emptyDraft(): Draft {
  return { caseId: newId(), form: emptyBuildingForm(), meta: { inspectionDate: today(), inspectors: [{ rank: '', name: '' }] } };
}

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<Draft> & LegacyDraft;
      const e = emptyDraft();
      const form = { ...e.form, ...d.form, renovation: { ...e.form.renovation, ...d.form?.renovation } };
      // 旧形式の下書き(関係者・立会者が文字列)を移行
      if (d.form?.ownerName && !form.representative.name) form.representative = { title: '', name: d.form.ownerName };
      if (d.meta?.witness && !form.witness.name) form.witness = { title: '', name: d.meta.witness };
      delete (form as { ownerName?: string }).ownerName;
      // 旧形式の下書き(検査員が「、」区切りの文字列)を移行
      const saved = d.meta?.inspectors as Inspector[] | string | undefined;
      const inspectors =
        typeof saved === 'string'
          ? parseInspectors(saved).map((name) => ({ rank: '', name }))
          : Array.isArray(saved) && saved.length
            ? saved
            : e.meta.inspectors;
      return {
        caseId: d.caseId ?? e.caseId,
        form,
        meta: { inspectionDate: d.meta?.inspectionDate ?? e.meta.inspectionDate, inspectors },
      };
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
  const [pendingPhotos, setPendingPhotos] = useState(0);
  /** 編集中に外した保存済みの写真(「保存」したときに削除する) */
  const [removedPhotos, setRemovedPhotos] = useState<string[]>([]);

  useEffect(() => {
    if (!isEdit) return;
    void getCase(caseId).then((c) => {
      if (!c) return setNotFound(true);
      setExisting(c);
      setDraft({
        caseId: c.id,
        form: toBuildingForm(c.building),
        meta: { inspectionDate: c.inspectionDate, inspectors: c.inspectors.length ? c.inspectors : [{ rank: '', name: '' }] },
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

  const addRenovationPhotos = async (files: File[]) => {
    const caseId = draft.caseId;
    setPendingPhotos((n) => n + files.length);
    // 端末のメモリを圧迫しないよう1枚ずつ処理する
    for (const file of files) {
      try {
        const img = await processImage(file);
        const id = newId();
        await savePhoto({ id, caseId, itemId: RENOVATION_PHOTO_KEY, ...img, createdAt: new Date().toISOString() });
        // 処理中に他の入力が変わっていても上書きしないよう、最新の状態に追加する
        setDraft((d) =>
          d && { ...d, form: { ...d.form, renovation: { ...d.form.renovation, photoIds: [...d.form.renovation.photoIds, id] } } },
        );
      } catch (e) {
        alert(
          e instanceof DOMException && e.name === 'QuotaExceededError'
            ? '端末の空き容量が不足しているため写真を保存できませんでした。'
            : `写真を追加できませんでした(${e instanceof Error ? e.message : String(e)})`,
        );
      } finally {
        setPendingPhotos((n) => n - 1);
      }
    }
  };

  const removeRenovationPhoto = (id: string) => {
    setDraft((d) => {
      if (!d) return d;
      const { [id]: _c, ...captions } = d.form.renovation.photoCaptions;
      void _c;
      const photoIds = d.form.renovation.photoIds.filter((x) => x !== id);
      return { ...d, form: { ...d.form, renovation: { ...d.form.renovation, photoIds, photoCaptions: captions } } };
    });
    // 保存済みの案件に付いている写真は、編集を「保存」するまで消さない(戻るで取り消せるように)
    if (existing?.building.renovation?.photoIds.includes(id)) setRemovedPhotos((r) => [...r, id]);
    else void deletePhoto(id).catch(() => undefined);
  };

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
      inspectors: normalizeInspectors(draft.meta.inspectors),
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
        await Promise.all(removedPhotos.map((id) => deletePhoto(id).catch(() => undefined)));
        navigate(paths.check(existing.id), { replace: true });
      } else {
        const c = createCase(building, meta, new Date(), draft.caseId);
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
    // 下書きで追加した写真も削除する
    void deletePhotosByCase(draft.caseId).catch(() => undefined);
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
          <InspectorsInput value={draft.meta.inspectors} onChange={(inspectors) => setMeta({ inspectors })} />
          {/* 対象物情報の立会者と同じ値を編集する(どちらで入力しても両方に反映) */}
          <PersonInput
            label="立会者"
            titlePlaceholder="例:防火管理者"
            hint="対象物情報の立会者と連動"
            value={draft.form.witness}
            onChange={(witness) => setDraft({ ...draft, form: { ...draft.form, witness } })}
          />
        </Section>

        <BuildingForm
          form={draft.form}
          errors={showErrors ? validation.errors : {}}
          onChange={(form) => setDraft({ ...draft, form })}
          renovationPhotos={{
            pending: pendingPhotos,
            onAdd: (files) => void addRenovationPhotos(files),
            onRemove: removeRenovationPhoto,
          }}
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
