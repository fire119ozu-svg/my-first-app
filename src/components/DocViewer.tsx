/**
 * 参考資料の表示(PDF・画像)。拡大縮小ボタン付き。
 * PDFは pdf.js で1ページずつ描画し、画面から離れたページは解放してメモリを抑える。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { closePdf, openPdf, PdfPasswordError, type PDFDocumentProxy } from '../references/pdf';
import type { ReferenceRecord } from '../types/inspection';

const ZOOMS = [1, 1.5, 2, 3];
/** 1ページのキャンバスの最大画素数(iPhoneのメモリ上限対策) */
const MAX_CANVAS_PIXELS = 12_000_000;

export function DocViewer({ doc }: { doc: ReferenceRecord }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [zoomIdx, setZoomIdx] = useState(0);
  const [baseWidth, setBaseWidth] = useState(0);
  const [page, setPage] = useState(1);
  const zoom = ZOOMS[zoomIdx];

  // 表示幅(拡大前)を画面幅に合わせる
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => setBaseWidth(el.clientWidth - 16);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 拡大縮小しても見ていた位置を保つ
  const ratio = useRef(0);
  const changeZoom = (delta: number) => {
    const el = scroller.current;
    if (el) ratio.current = el.scrollTop / Math.max(1, el.scrollHeight);
    setZoomIdx((i) => Math.min(ZOOMS.length - 1, Math.max(0, i + delta)));
  };
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = ratio.current * el.scrollHeight;
  }, [zoom]);

  const width = Math.round(baseWidth * zoom);

  return (
    <div className="doc-viewer">
      <div className="doc-scroll" ref={scroller}>
        {baseWidth > 0 &&
          (doc.kind === 'pdf' ? (
            <PdfPages blob={doc.blob} width={width} scroller={scroller} onPage={setPage} />
          ) : (
            <ImageDoc blob={doc.blob} width={width} title={doc.title} />
          ))}
      </div>
      <div className="doc-toolbar">
        <button type="button" className="viewer-btn" onClick={() => changeZoom(-1)} disabled={zoomIdx === 0} aria-label="縮小">
          －
        </button>
        <span className="doc-zoom">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          className="viewer-btn"
          onClick={() => changeZoom(1)}
          disabled={zoomIdx === ZOOMS.length - 1}
          aria-label="拡大"
        >
          ＋
        </button>
        {doc.kind === 'pdf' && (
          <span className="doc-page" aria-live="polite">
            {page} / {doc.pageCount}
          </span>
        )}
      </div>
    </div>
  );
}

function ImageDoc({ blob, width, title }: { blob: Blob; width: number; title: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url ? <img className="doc-image" src={url} alt={title} style={{ width }} /> : null;
}

function PdfPages(props: {
  blob: Blob;
  width: number;
  scroller: React.RefObject<HTMLDivElement | null>;
  onPage: (n: number) => void;
}) {
  const { blob, width, scroller, onPage } = props;
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [aspect, setAspect] = useState(1.414); // A4縦を仮定し、1ページ目で更新
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let doc: PDFDocumentProxy | null = null;
    let cancelled = false;
    void (async () => {
      try {
        doc = await openPdf(await blob.arrayBuffer());
        if (cancelled) return closePdf(doc);
        const first = (await doc.getPage(1)).getViewport({ scale: 1 });
        setAspect(first.height / first.width);
        setPdf(doc);
      } catch (e) {
        if (!cancelled) setError(e instanceof PdfPasswordError ? e.message : 'PDFを表示できませんでした。');
      }
    })();
    return () => {
      cancelled = true;
      if (doc) closePdf(doc);
    };
  }, [blob]);

  // 表示中のページ番号
  useEffect(() => {
    const el = scroller.current;
    if (!el || !pdf) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const mid = el.scrollTop + el.clientHeight / 3;
        const pages = el.querySelectorAll<HTMLElement>('.pdf-page');
        let n = 1;
        pages.forEach((p, i) => {
          if (p.offsetTop <= mid) n = i + 1;
        });
        onPage(n);
      });
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [pdf, scroller, onPage, width]);

  if (error) return <p className="error-banner">{error}</p>;
  if (!pdf) return <p className="muted center doc-loading">読み込み中…</p>;
  return (
    <div className="pdf-pages" style={{ width }}>
      {Array.from({ length: pdf.numPages }, (_, i) => (
        <PdfPage key={i} pdf={pdf} number={i + 1} width={width} aspect={aspect} scroller={scroller} />
      ))}
    </div>
  );
}

function PdfPage(props: {
  pdf: PDFDocumentProxy;
  number: number;
  width: number;
  aspect: number;
  scroller: React.RefObject<HTMLDivElement | null>;
}) {
  const { pdf, number, width, scroller } = props;
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [aspect, setAspect] = useState(props.aspect);

  // 画面の近く(前後1.5画面分)にある間だけ描画する
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), {
      root: scroller.current,
      rootMargin: '150% 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [scroller]);

  useEffect(() => {
    const c = canvas.current;
    if (!near || !c) return;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    let cancelled = false;
    void (async () => {
      const page = await pdf.getPage(number);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      setAspect(base.height / base.width);
      let scale = (width * Math.min(window.devicePixelRatio || 1, 2)) / base.width;
      const pixels = base.width * base.height * scale * scale;
      if (pixels > MAX_CANVAS_PIXELS) scale *= Math.sqrt(MAX_CANVAS_PIXELS / pixels);
      const viewport = page.getViewport({ scale });
      c.width = Math.floor(viewport.width);
      c.height = Math.floor(viewport.height);
      task = page.render({ canvas: c, viewport });
      await task.promise.catch(() => undefined); // 中断時は無視
    })();
    return () => {
      cancelled = true;
      task?.cancel();
      // 画面から離れたらキャンバスを解放
      c.width = 0;
      c.height = 0;
    };
  }, [near, pdf, number, width]);

  return (
    <div className="pdf-page" ref={box} style={{ height: Math.round(width * aspect) }} aria-label={`${number}ページ`}>
      <canvas ref={canvas} />
    </div>
  );
}
