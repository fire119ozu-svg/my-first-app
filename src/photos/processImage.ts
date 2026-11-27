/**
 * 写真の縮小・JPEG化(端末内で処理)。
 * iPhoneの写真は1枚数MBあるため、保存容量とExcelの大きさを抑えるために縮小する。
 */

/** 保存する画像の長辺(px)。報告書の写真として十分な解像度 */
export const PHOTO_MAX_EDGE = 1600;
/** 一覧表示用の縮小版の長辺(px) */
export const THUMB_MAX_EDGE = 320;

export interface ProcessedImage {
  blob: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

/** 長辺が max を超える場合だけ縮小したサイズを返す */
export function fitSize(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

type Drawable = ImageBitmap | HTMLImageElement;

/** 画像を読み込む。向き(EXIF)は表示どおりに補正される */
async function load(file: Blob): Promise<{ img: Drawable; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { img: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // 未対応の形式などは <img> で読み込む
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw new Error('画像を読み込めませんでした。JPEG・PNG形式の写真を選んでください。', { cause: e });
  }
}

function encode(img: Drawable, width: number, height: number, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('画像処理を開始できませんでした');
  // 透過PNGの背景を白にする(JPEGは透過を持てないため)
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => {
        // iOSのメモリを早めに解放する
        canvas.width = canvas.height = 0;
        if (b) resolve(b);
        else reject(new Error('画像を変換できませんでした'));
      },
      'image/jpeg',
      quality,
    ),
  );
}

export async function processImage(file: Blob): Promise<ProcessedImage> {
  const src = await load(file);
  try {
    const main = fitSize(src.width, src.height, PHOTO_MAX_EDGE);
    const small = fitSize(src.width, src.height, THUMB_MAX_EDGE);
    const blob = await encode(src.img, main.width, main.height, 0.82);
    const thumb = await encode(src.img, small.width, small.height, 0.7);
    return { blob, thumb, width: main.width, height: main.height };
  } finally {
    src.close();
  }
}
