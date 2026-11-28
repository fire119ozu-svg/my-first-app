import { useEffect, useMemo, useState } from 'react';
import { BuildingForm } from '../components/BuildingForm';
import { Field, PersonInput, Section, TextInput } from '../components/controls';
import { Header, HeaderLink } from '../components/Header';
import { InspectorsInput } from '../components/InspectorsInput';
import {
  emptyBuildingForm,
  emptySiteForm,
  toBuildingForm,
  toSiteForm,
  validateBuildingForm,
  validateSiteForm,
  type BuildingFormState,
  type SiteFormState,
} from '../logic/buildingForm';
import { extractChecklistItems } from '../logic/extractChecklist';
import {
  createCase,
  newId,
  normalizeInspectors,
  parseInspectors,
  removedBuildingsWithInput,
  renovationPhotoKey,
  today,
  updateCaseInfo,
} from '../logic/inspectionCase';
import { processImage } from '../photos/processImage';
import { navigate, paths } from '../router';
import { deleteCase, deletePhoto, deletePhotosByCase, getCase, saveCase, savePhoto } from '../storage/caseStore';
import { loadInspectors, loadOffice, storeInspectors, storeOffice } from '../storage/formDefaults';
import { splitLegacyBuilding, type LegacyBuilding } from '../storage/migrate';
import type { InspectionCase, Inspector, OfficeInfo } from '../types/inspection';

interface MetaForm {
  inspectionDate: string;
  inspectors: Inspector[];
  office: OfficeInfo;
}

interface Draft {
  /** 案件ID。新規でも下書きの段階で決め、写真をこのIDで保存する */
  caseId: string;
  site: SiteFormState;
  buildings: BuildingFormState[];
  meta: MetaForm;
}

/**
 * 新規入力中の下書きを端末内に退避する(Safariのタブ破棄・再読込対策)。
 * 案件として作成した時点で破棄する。
 */
const DRAFT_KEY = 'newCaseDraft:v2';
/** 1棟のみだった頃の下書き */
const LEGACY_DRAFT_KEY = 'newCaseDraft:v1';

function emptyDraft(): Draft {
  return {
    caseId: newId(),
    site: emptySiteForm(),
    buildings: [emptyBuildingForm()],
    // 所属・TEL・検査員は前回の値を自動で入れる
    meta: { inspectionDate: today(), inspectors: loadInspectors(), office: loadOffice() },
  };
}

const LEGACY_BUILDING_FIELDS = [
  'usage',
  'totalFloorArea',
  'floorsAbove',
  'floorsBelow',
  'isHighRise',
  'hasWindowlessFloor',
  'isSingleStaircase',
  'hasMultipleOwners',
  'installedEquipment',
  'facilities',
  'notifications',
];

/** 旧形式(v1:1棟のみ)の下書きを変換する */
function fromLegacyDraft(raw: string): Draft {
  const e = emptyDraft();
  const d = JSON.parse(raw) as {
    caseId?: string;
    form?: Partial<LegacyBuilding> & { capacity?: string; ownerName?: string; renovation?: BuildingFormState['renovation'] };
    meta?: { inspectionDate?: string; inspectors?: Inspector[] | string; witness?: string };
  };
  const f = d.form ?? {};
  const blank = emptyBuildingForm();
  const site: SiteFormState = {
    name: f.name ?? '',
    address: f.address ?? '',
    representative: f.representative ?? (f.ownerName ? { title: '', name: f.ownerName } : { title: '', name: '' }),
    witness: f.witness ?? (d.meta?.witness ? { title: '', name: d.meta.witness } : { title: '', name: '' }),
  };
  // 16項の「含まれる用途」はテナントとして引き継ぐ
  const legacy = f.usage
    ? splitLegacyBuilding({ ...(f as LegacyBuilding), subUsages: f.subUsages ?? [] }, blank.id).building
    : null;
  const capacity = Number(f.capacity);
  const building: BuildingFormState = {
    ...blank,
    ...Object.fromEntries(Object.entries(f).filter(([k]) => LEGACY_BUILDING_FIELDS.includes(k))),
    renovation: { ...blank.renovation, ...f.renovation },
    tenants: (legacy?.tenants ?? []).map((t) => ({ ...t, area: '', capacity: '' })),
    capacityFallback: f.capacity && Number.isInteger(capacity) ? capacity : null,
  };
  const saved = d.meta?.inspectors;
  const inspectors =
    typeof saved === 'string'
      ? parseInspectors(saved).map((name) => ({ rank: '', name }))
      : Array.isArray(saved) && saved.length
        ? saved
        : e.meta.inspectors;
  return {
    caseId: d.caseId ?? e.caseId,
    site,
    buildings: [building],
    meta: { inspectionDate: d.meta?.inspectionDate ?? e.meta.inspectionDate, inspectors, office: e.meta.office },
  };
}

/** 下書きの棟を現在の形式に(有効開口部の方角が無かった頃の下書きは方角を空欄に) */
function fromDraftBuilding(b: BuildingFormState): BuildingFormState {
  const f = { ...emptyBuildingForm(b.id), ...b };
  return {
    ...f,
    openingRecords: f.openingRecords.map((r) => ({ ...r, openings: r.openings.map((o) => ({ ...o, direction: o.direction ?? '' })) })),
  };
}

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<Draft>;
      const e = emptyDraft();
      return {
        caseId: d.caseId ?? e.caseId,
        site: { ...e.site, ...d.site },
        buildings: d.buildings?.length ? d.buildings.map(fromDraftBuilding) : e.buildings,
        meta: { ...e.meta, ...d.meta },
      };
    }
    const legacy = localStorage.getItem(LEGACY_DRAFT_KEY);
    if (legacy) return fromLegacyDraft(legacy);
  } catch {
    // 保存領域が使えない環境では空のフォームから開始
  }
  return emptyDraft();
}

function storeDraft(d: Draft | null) {
  try {
    if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(LEGACY_DRAFT_KEY);
  } catch {
    // 保存できなくても入力は継続できる
  }
}

/** 表示用の棟名 */
const tabName = (b: BuildingFormState, i: number) => b.label.trim() || `第${i + 1}棟`;

export function CaseFormScreen({ caseId }: { caseId?: string }) {
  const isEdit = caseId !== undefined;
  const [existing, setExisting] = useState<InspectionCase | null>(null);
  const [draft, setDraft] = useState<Draft | null>(() => (isEdit ? null : loadDraft()));
  const [active, setActive] = useState(0);
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
        site: toSiteForm(c.site),
        buildings: c.buildings.map(toBuildingForm),
        meta: {
          inspectionDate: c.inspectionDate,
          inspectors: c.inspectors.length ? c.inspectors : [{ rank: '', name: '' }],
          office: c.office ?? loadOffice(),
        },
      });
    });
  }, [caseId, isEdit]);

  useEffect(() => {
    if (!isEdit && draft) storeDraft(draft);
  }, [draft, isEdit]);

  const validation = useMemo(() => {
    if (!draft) return null;
    return { site: validateSiteForm(draft.site), buildings: draft.buildings.map(validateBuildingForm) };
  }, [draft]);
  const itemCount = useMemo(
    () => (validation?.buildings ?? []).reduce((n, v) => n + (v.building ? extractChecklistItems(v.building).length : 0), 0),
    [validation],
  );

  if (notFound) {
    return (
      <>
        <Header title="案件" left={<HeaderLink href={paths.list()}>‹ 一覧</HeaderLink>} />
        <main className="app-main"><p className="error-banner">案件が見つかりません。</p></main>
      </>
    );
  }
  if (!draft || !validation) return null;

  const current = Math.min(active, draft.buildings.length - 1);
  const allValid = !!validation.site.site && validation.buildings.every((v) => v.building);
  const dateError = showErrors && !draft.meta.inspectionDate ? '検査日を入力してください' : undefined;
  const setMeta = (patch: Partial<MetaForm>) => setDraft({ ...draft, meta: { ...draft.meta, ...patch } });
  const setSite = (patch: Partial<SiteFormState>) => setDraft({ ...draft, site: { ...draft.site, ...patch } });
  // 写真の処理中に他の入力が変わっても上書きしないよう、常に最新の状態を更新する
  const updateBuildingForm = (id: string, fn: (b: BuildingFormState) => BuildingFormState) =>
    setDraft((d) => d && { ...d, buildings: d.buildings.map((x) => (x.id === id ? fn(x) : x)) });

  /** 保存済みの案件にある写真は「保存」まで削除しない(「戻る」で取り消せるように) */
  const isSavedPhoto = (id: string) => existing?.buildings.some((x) => x.renovation?.photoIds.includes(id)) ?? false;
  const dropPhotos = (ids: string[]) => {
    setRemovedPhotos((r) => [...r, ...ids.filter(isSavedPhoto)]);
    for (const id of ids.filter((x) => !isSavedPhoto(x))) void deletePhoto(id).catch(() => undefined);
  };

  const addRenovationPhotos = async (buildingId: string, files: File[]) => {
    setPendingPhotos((n) => n + files.length);
    // 端末のメモリを圧迫しないよう1枚ずつ処理する
    for (const file of files) {
      try {
        const img = await processImage(file);
        const id = newId();
        await savePhoto({ id, caseId: draft.caseId, itemId: renovationPhotoKey(buildingId), ...img, createdAt: new Date().toISOString() });
        updateBuildingForm(buildingId, (x) => ({ ...x, renovation: { ...x.renovation, photoIds: [...x.renovation.photoIds, id] } }));
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

  const removeRenovationPhoto = (buildingId: string, id: string) => {
    updateBuildingForm(buildingId, (x) => {
      const { [id]: _c, ...captions } = x.renovation.photoCaptions;
      void _c;
      return { ...x, renovation: { ...x.renovation, photoIds: x.renovation.photoIds.filter((p) => p !== id), photoCaptions: captions } };
    });
    dropPhotos([id]);
  };

  const addBuilding = () => {
    setDraft({ ...draft, buildings: [...draft.buildings, emptyBuildingForm()] });
    setActive(draft.buildings.length);
  };

  const removeBuilding = (target: BuildingFormState, index: number) => {
    const name = tabName(target, index);
    // 保存済みの棟で、判定・メモ・写真などの入力があるか
    const hasResults =
      !!existing &&
      removedBuildingsWithInput(existing, existing.buildings.filter((x) => x.id !== target.id)).some((x) => x.id === target.id);
    const msg = hasResults
      ? `「${name}」を削除しますか?\nこの棟の判定・メモ・写真も削除されます(「保存」した時点で確定します)。`
      : `「${name}」を削除しますか?`;
    if (!confirm(msg)) return;
    dropPhotos(target.renovation.photoIds);
    setDraft({ ...draft, buildings: draft.buildings.filter((x) => x.id !== target.id) });
    setActive(Math.max(0, index - 1));
  };

  const submit = async () => {
    if (!allValid || !draft.meta.inspectionDate) {
      setShowErrors(true);
      // 入力に不備のある最初の棟を開く
      const bad = validation.buildings.findIndex((v) => !v.building);
      if (validation.site.site && bad >= 0) setActive(bad);
      requestAnimationFrame(() =>
        document.querySelector('.has-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      );
      return;
    }
    const site = validation.site.site!;
    const buildings = validation.buildings.map((v) => v.building!);
    const office = { department: draft.meta.office.department.trim(), phone: draft.meta.office.phone.trim() };
    const meta = { inspectionDate: draft.meta.inspectionDate, inspectors: normalizeInspectors(draft.meta.inspectors), office };
    storeOffice(office);
    storeInspectors(meta.inspectors);
    setSaving(true);
    try {
      if (existing) {
        const { case: next, removedPhotoIds } = updateCaseInfo(existing, site, buildings, meta);
        const before = existing.checklists.reduce((n, cl) => n + cl.itemIds.length, 0);
        const after = next.checklists.reduce((n, cl) => n + cl.itemIds.length, 0);
        if (before !== after && !confirm(`チェック項目が ${before} 件から ${after} 件に変わります。\n入力済みの結果は保持されます。保存しますか?`)) {
          return;
        }
        await saveCase(next);
        await Promise.all([...removedPhotos, ...removedPhotoIds].map((id) => deletePhoto(id).catch(() => undefined)));
        navigate(paths.check(existing.id), { replace: true });
      } else {
        const c = createCase(site, buildings, meta, new Date(), draft.caseId);
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
    setActive(0);
    setShowErrors(false);
  };

  const remove = async () => {
    if (!existing) return;
    if (!confirm(`「${existing.site.name}」を削除しますか?\nこの操作は取り消せません。`)) return;
    await deleteCase(existing.id);
    navigate(paths.list(), { replace: true });
  };

  const siteErrors = showErrors ? validation.site.errors : {};
  const b = draft.buildings[current];
  const multi = draft.buildings.length > 1;

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
          <InspectorsInput
            value={draft.meta.inspectors}
            onChange={(inspectors) => setMeta({ inspectors })}
            hint="次の案件にも自動で入ります(変更・削除できます)"
          />
          <TextInput
            label="所属"
            value={draft.meta.office.department}
            onChange={(department) => setMeta({ office: { ...draft.meta.office, department } })}
            placeholder="例:高知市中央消防署庶務予防係"
            hint="査察結果通知書に記載します。次の案件にも自動で入ります"
          />
          <TextInput
            label="問い合わせ先TEL"
            inputMode="tel"
            value={draft.meta.office.phone}
            onChange={(phone) => setMeta({ office: { ...draft.meta.office, phone } })}
            placeholder="例:088-000-0000"
          />
          {/* 対象物情報の立会者と同じ値を編集する(どちらで入力しても両方に反映) */}
          <PersonInput
            label="立会者"
            titlePlaceholder="例:防火管理者"
            hint="対象物情報の立会者と連動"
            value={draft.site.witness}
            onChange={(witness) => setSite({ witness })}
          />
        </Section>

        <Section title="基本情報">
          <TextInput label="名称" required value={draft.site.name} error={siteErrors.name} onChange={(v) => setSite({ name: v })} placeholder="例:○○ビル" />
          <TextInput label="所在地" value={draft.site.address} onChange={(v) => setSite({ address: v })} placeholder="例:高知市本町○丁目" />
          <PersonInput label="代表者(通知書の名宛人)" titlePlaceholder="例:代表取締役" value={draft.site.representative} onChange={(representative) => setSite({ representative })} />
          <PersonInput label="立会者" titlePlaceholder="例:防火管理者" hint="検査情報の立会者と連動" value={draft.site.witness} onChange={(witness) => setSite({ witness })} />
        </Section>

        <h2 className="section-title building-tabs-title">棟{multi && `(${draft.buildings.length}棟)`}</h2>
        <div className="building-tabs" role="tablist" aria-label="棟">
          {draft.buildings.map((x, i) => {
            const invalid = showErrors && !validation.buildings[i].building;
            return (
              <button
                key={x.id}
                type="button"
                role="tab"
                aria-selected={i === current}
                className={`chip${i === current ? ' on' : ''}${invalid ? ' invalid' : ''}`}
                onClick={() => setActive(i)}
              >
                {tabName(x, i)}
                {invalid && <span className="tab-alert" aria-label="未入力あり">!</span>}
              </button>
            );
          })}
          <button type="button" className="chip add" onClick={addBuilding}>
            ＋ 棟を追加
          </button>
        </div>

        <BuildingForm
          key={b.id}
          title={multi ? tabName(b, current) : '対象物'}
          form={b}
          errors={showErrors ? validation.buildings[current].errors : {}}
          onChange={(form) => updateBuildingForm(b.id, () => form)}
          renovationPhotos={{
            pending: pendingPhotos,
            onAdd: (files) => void addRenovationPhotos(b.id, files),
            onRemove: (id) => removeRenovationPhoto(b.id, id),
          }}
        />

        {multi && (
          <button type="button" className="danger-btn" onClick={() => removeBuilding(b, current)}>
            「{tabName(b, current)}」を削除
          </button>
        )}
        {existing && (
          <button type="button" className="danger-btn" onClick={() => void remove()}>
            この案件を削除
          </button>
        )}
      </main>
      <footer className="action-bar">
        <span className="action-count">
          {allValid ? (
            <>
              該当 <strong>{itemCount}</strong> 件{multi && <small>({draft.buildings.length}棟)</small>}
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
