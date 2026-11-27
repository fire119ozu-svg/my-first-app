import { useEffect, useMemo, useState } from 'react';
import { BuildingForm } from './components/BuildingForm';
import { ExtractionPreview } from './components/ExtractionPreview';
import { emptyBuildingForm, validateBuildingForm, type BuildingFormState } from './logic/buildingForm';
import { extractChecklistItems } from './logic/extractChecklist';

/**
 * 入力途中の下書きを端末内に退避する(Safariのタブ破棄・再読込対策)。
 * 案件としての保存は IndexedDB で別途実装する。
 */
const DRAFT_KEY = 'buildingFormDraft:v1';

function loadDraft(): BuildingFormState {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return { ...emptyBuildingForm(), ...JSON.parse(raw) };
  } catch {
    // 保存領域が使えない環境(プライベートブラウズ等)では空のフォームから開始
  }
  return emptyBuildingForm();
}

type Step = 'form' | 'preview';

export default function App() {
  const [form, setForm] = useState<BuildingFormState>(loadDraft);
  const [step, setStep] = useState<Step>('form');
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    } catch {
      // 保存できなくても入力は継続できる
    }
  }, [form]);

  const { building, errors } = useMemo(() => validateBuildingForm(form), [form]);
  const items = useMemo(() => (building ? extractChecklistItems(building) : []), [building]);

  const goPreview = () => {
    if (!building) {
      setShowErrors(true);
      requestAnimationFrame(() =>
        document.querySelector('.has-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      );
      return;
    }
    setStep('preview');
    window.scrollTo(0, 0);
  };

  const reset = () => {
    if (!confirm('入力内容をすべて消去しますか?')) return;
    setForm(emptyBuildingForm());
    setShowErrors(false);
  };

  return (
    <div className="app">
      <header className="app-header">
        {step === 'preview' && (
          <button type="button" className="header-btn" onClick={() => setStep('form')}>
            ‹ 入力に戻る
          </button>
        )}
        <h1>{step === 'form' ? '対象物情報' : '抽出結果'}</h1>
        {step === 'form' && (
          <button type="button" className="header-btn right" onClick={reset}>
            クリア
          </button>
        )}
      </header>

      <main className="app-main">
        {step === 'form' ? (
          <BuildingForm form={form} errors={showErrors ? errors : {}} onChange={setForm} />
        ) : (
          building && <ExtractionPreview building={building} items={items} />
        )}
      </main>

      {step === 'form' && (
        <footer className="action-bar">
          <span className="action-count">
            {building ? (
              <>
                該当 <strong>{items.length}</strong> 件
              </>
            ) : (
              '必須項目を入力'
            )}
          </span>
          <button type="button" className="primary-btn" onClick={goPreview}>
            チェック項目を抽出
          </button>
        </footer>
      )}
    </div>
  );
}
