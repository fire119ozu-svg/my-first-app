/**
 * 検査案件の端末内保存(IndexedDB)。
 * データは端末のブラウザ内にのみ保存され、外部へは送信されない。
 */
import type { InspectionCase } from '../types/inspection';
import { migrateCase } from './migrate';

const DB_NAME = 'fire-inspection';
const DB_VERSION = 1;
const STORE = 'cases';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // 別タブでDBが更新された場合に接続を閉じ、次回開き直す
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        // 書き込みはトランザクション完了(ディスク反映)まで待つ
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error ?? req.error);
        tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
      }),
  );
}

/** 更新日時の新しい順 */
export async function listCases(): Promise<InspectionCase[]> {
  const all = (await run<InspectionCase[]>('readonly', (s) => s.getAll())).map(migrateCase);
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getCase(id: string): Promise<InspectionCase | undefined> {
  const c = await run<InspectionCase | undefined>('readonly', (s) => s.get(id));
  return c && migrateCase(c);
}

export async function saveCase(c: InspectionCase): Promise<void> {
  await run('readwrite', (s) => s.put(c));
}

export async function deleteCase(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id));
}

/**
 * ブラウザによる自動削除の対象外にするよう要求する。
 * Safariはホーム画面に追加したPWAでない場合、一定期間未使用のサイトデータを削除することがある。
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** テスト用:接続をリセットする */
export function _resetConnectionForTest(): void {
  dbPromise = null;
}
