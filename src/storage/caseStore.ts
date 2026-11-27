/**
 * 検査案件の端末内保存(IndexedDB)。
 * データは端末のブラウザ内にのみ保存され、外部へは送信されない。
 */
import type { InspectionCase, PhotoRecord } from '../types/inspection';
import { migrateCase } from './migrate';

const DB_NAME = 'fire-inspection';
/** v1: cases / v2: photos を追加 */
const DB_VERSION = 2;
const CASES = 'cases';
const PHOTOS = 'photos';
type StoreName = typeof CASES | typeof PHOTOS;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CASES)) {
        const store = db.createObjectStore(CASES, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains(PHOTOS)) {
        const store = db.createObjectStore(PHOTOS, { keyPath: 'id' });
        store.createIndex('caseId', 'caseId');
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
    // 古い版を開いた別タブがある場合。閉じられれば続行される
    req.onblocked = () => console.warn('IndexedDB upgrade blocked by another tab');
  });
  return dbPromise;
}

/**
 * トランザクションを実行し、完了(ディスク反映)まで待って fn の戻り値を返す。
 * fn が IDBRequest を返した場合はその結果を返す。
 */
function tx<T>(
  stores: StoreName | StoreName[],
  mode: IDBTransactionMode,
  fn: (t: IDBTransaction) => IDBRequest<T> | void,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(stores, mode);
        const req = fn(t);
        t.oncomplete = () => resolve(req ? req.result : (undefined as T));
        t.onerror = () => reject(t.error ?? req?.error);
        t.onabort = () => reject(t.error ?? new Error('Transaction aborted'));
      }),
  );
}

/** 更新日時の新しい順 */
export async function listCases(): Promise<InspectionCase[]> {
  const all = (await tx<InspectionCase[]>(CASES, 'readonly', (t) => t.objectStore(CASES).getAll())).map(migrateCase);
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getCase(id: string): Promise<InspectionCase | undefined> {
  const c = await tx<InspectionCase | undefined>(CASES, 'readonly', (t) => t.objectStore(CASES).get(id));
  return c && migrateCase(c);
}

export async function saveCase(c: InspectionCase): Promise<void> {
  await tx(CASES, 'readwrite', (t) => t.objectStore(CASES).put(c));
}

/** 案件と、その案件の写真をまとめて削除する */
export async function deleteCase(id: string): Promise<void> {
  await tx([CASES, PHOTOS], 'readwrite', (t) => {
    t.objectStore(CASES).delete(id);
    const photos = t.objectStore(PHOTOS);
    const cursor = photos.index('caseId').openKeyCursor(IDBKeyRange.only(id));
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (!c) return;
      photos.delete(c.primaryKey);
      c.continue();
    };
  });
}

// ---------------------------------------------------------------------------
// 写真
// ---------------------------------------------------------------------------

export async function savePhoto(p: PhotoRecord): Promise<void> {
  await tx(PHOTOS, 'readwrite', (t) => t.objectStore(PHOTOS).put(p));
}

export function getPhoto(id: string): Promise<PhotoRecord | undefined> {
  return tx<PhotoRecord | undefined>(PHOTOS, 'readonly', (t) => t.objectStore(PHOTOS).get(id));
}

export function listPhotosByCase(caseId: string): Promise<PhotoRecord[]> {
  return tx<PhotoRecord[]>(PHOTOS, 'readonly', (t) =>
    t.objectStore(PHOTOS).index('caseId').getAll(IDBKeyRange.only(caseId)),
  );
}

export async function deletePhoto(id: string): Promise<void> {
  await tx(PHOTOS, 'readwrite', (t) => t.objectStore(PHOTOS).delete(id));
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
