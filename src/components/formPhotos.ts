/**
 * 対象物情報の入力欄(増改築・有効開口部)に添付する写真の操作。
 */
import type { BuildingFormState } from '../logic/buildingForm';

/**
 * 対象物情報の写真操作(増改築・有効開口部の全景・窓。保存処理は画面側で行う)。
 * key は写真の保存キー(PhotoRecord.itemId)。
 */
export interface FormPhotoHandlers {
  /** 処理中の枚数 */
  pending: (key: string) => number;
  /** 写真を保存し、attach で最新の入力状態に写真IDを足す */
  add: (key: string, files: File[], attach: (b: BuildingFormState, photoId: string) => BuildingFormState) => void;
  /** 写真を外す(detach で入力から外す。写真本体は保存時または即時に削除) */
  remove: (photoIds: string[], detach?: (b: BuildingFormState) => BuildingFormState) => void;
}

/** 写真IDとコメントを持つ欄から1枚外す */
export function withoutPhoto<T extends { photoIds: string[]; photoCaptions: Record<string, string> }>(x: T, id: string): T {
  const { [id]: _c, ...photoCaptions } = x.photoCaptions;
  void _c;
  return { ...x, photoIds: x.photoIds.filter((p) => p !== id), photoCaptions };
}

/** 写真のコメントを更新する(空なら消す) */
export function withCaption<T extends { photoCaptions: Record<string, string> }>(x: T, id: string, caption: string): T {
  const { [id]: _old, ...rest } = x.photoCaptions;
  void _old;
  return { ...x, photoCaptions: caption ? { ...rest, [id]: caption } : rest };
}
