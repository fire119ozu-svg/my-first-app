/**
 * ハッシュベースの簡易ルーター。
 * 静的ホスティング・PWA(オフライン)でも再読み込みや戻る操作で画面が保たれる。
 */
import { useEffect, useState } from 'react';

export type Route =
  | { name: 'list' }
  | { name: 'new' }
  | { name: 'check'; caseId: string }
  | { name: 'edit'; caseId: string };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  if (path === '/new') return { name: 'new' };
  const m = path.match(/^\/case\/([^/]+)(\/edit)?$/);
  if (m) {
    const caseId = decodeURIComponent(m[1]);
    return m[2] ? { name: 'edit', caseId } : { name: 'check', caseId };
  }
  return { name: 'list' };
}

export const paths = {
  list: () => '#/',
  new: () => '#/new',
  check: (id: string) => `#/case/${encodeURIComponent(id)}`,
  edit: (id: string) => `#/case/${encodeURIComponent(id)}/edit`,
};

export function navigate(hash: string, { replace = false } = {}): void {
  if (replace) {
    history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = hash;
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
