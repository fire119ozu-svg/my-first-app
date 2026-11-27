import { useEffect } from 'react';
import { useRoute } from './router';
import { CaseFormScreen } from './screens/CaseFormScreen';
import { CaseListScreen } from './screens/CaseListScreen';
import { CheckScreen } from './screens/CheckScreen';
import { requestPersistentStorage } from './storage/caseStore';

export default function App() {
  const route = useRoute();

  useEffect(() => {
    // 保存データがブラウザに自動削除されないよう要求(対応ブラウザのみ)
    void requestPersistentStorage();
  }, []);

  return (
    <div className="app">
      {route.name === 'list' && <CaseListScreen />}
      {route.name === 'new' && <CaseFormScreen key="new" />}
      {route.name === 'edit' && <CaseFormScreen key={`edit-${route.caseId}`} caseId={route.caseId} />}
      {route.name === 'check' && <CheckScreen key={route.caseId} caseId={route.caseId} />}
    </div>
  );
}
