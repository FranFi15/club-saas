import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './DniImageCropModal.css';

/** Argentine ID-1 card ≈ 85.6 × 53.98 mm */
export const DNI_ASPECT = [86, 54];

const FRAME_W = 320;

/**
 * Pan + zoom crop for DNI photos (web). Exports a JPEG File.
 */
export default function DniImageCropModal({
  open,
  imageUrl,
  aspect = DNI_ASPECT,
  title = 'Ajustá el DNI',
  onCancel,
  onConfirm,
}) {
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [exporting, setExporting] = useState(false);
  const dragRef = useRef(null);

  const frame = useMemo(() => {
    const [aw, ah] = aspect;
    const ratio = (aw > 0 && ah > 0 ? aw : 86) / (ah > 0 ? ah : 54);
    const w = FRAME_W;
    const h = Math.round(w / ratio);
    return { w, h, ratio };
  }, [aspect]);

  const coverScale = useMemo(() => {
    if (!imgSize.w || !imgSize.h) return 1;
    return Math.max(frame.w / imgSize.w, frame.h / imgSize.h);
  }, [imgSize, frame]);

  const minScale = coverScale;
  const maxScale = coverScale * 4;

  useEffect(() => {
    if (!open || !imageUrl) return;
    setImgSize({ w: 0, h: 0 });
    setOffset({ x: 0, y: 0 });
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      setImgSize({ w, h });
      const cover = Math.max(frame.w / w, frame.h / h);
      setScale(cover);
      setOffset({ x: 0, y: 0 });
    };
    img.onerror = () => setImgSize({ w: 0, h: 0 });
    img.src = imageUrl;
  }, [open, imageUrl, frame.w, frame.h]);

  const clampOffset = useCallback(
    (x, y, s) => {
      const dispW = imgSize.w * s;
      const dispH = imgSize.h * s;
      const maxX = Math.max(0, (dispW - frame.w) / 2);
      const maxY = Math.max(0, (dispH - frame.h) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, x)),
        y: Math.min(maxY, Math.max(-maxY, y)),
      };
    },
    [imgSize, frame],
  );

  const onScaleChange = (next) => {
    const s = Math.min(maxScale, Math.max(minScale, Number(next)));
    setScale(s);
    setOffset((o) => clampOffset(o.x, o.y, s));
  };

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: offset.x,
      origY: offset.y,
    };
  };

  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clampOffset(dragRef.current.origX + dx, dragRef.current.origY + dy, scale));
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const cropRectInImageSpace = () => {
    const dispW = imgSize.w * scale;
    const dispH = imgSize.h * scale;
    const imgLeft = (frame.w - dispW) / 2 + offset.x;
    const imgTop = (frame.h - dispH) / 2 + offset.y;
    let sx = -imgLeft / scale;
    let sy = -imgTop / scale;
    let sw = frame.w / scale;
    let sh = frame.h / scale;
    sx = Math.max(0, Math.min(imgSize.w - 1, sx));
    sy = Math.max(0, Math.min(imgSize.h - 1, sy));
    sw = Math.max(1, Math.min(imgSize.w - sx, sw));
    sh = Math.max(1, Math.min(imgSize.h - sy, sh));
    return { sx, sy, sw, sh };
  };

  const exportCrop = async () => {
    if (!imgSize.w || !imageUrl) return;
    setExporting(true);
    try {
      const { sx, sy, sw, sh } = cropRectInImageSpace();
      const outW = 1600;
      const outH = Math.max(1, Math.round(outW / frame.ratio));
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('No se pudo cargar la imagen.'));
        el.src = imageUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, outW, outH);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('No se pudo recortar.'))),
          'image/jpeg',
          0.92,
        );
      });
      const file = new File([blob], `dni-${Date.now()}.jpg`, { type: 'image/jpeg' });
      await onConfirm?.(file);
    } finally {
      setExporting(false);
    }
  };

  if (!open) return null;

  const ready = imgSize.w > 0;

  return (
    <div className="dni-crop-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="dni-crop-sheet">
        <h2 className="dni-crop-title">{title}</h2>
        <p className="dni-crop-hint">
          Encuadrá todo el documento. Arrastrá para mover · usá el zoom. Así el sistema puede leer
          mejor tus datos.
        </p>

        <div
          className="dni-crop-frame"
          style={{ width: frame.w, height: frame.h }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {ready ? (
            <img
              src={imageUrl}
              alt=""
              draggable={false}
              style={{
                position: 'absolute',
                width: imgSize.w * scale,
                height: imgSize.h * scale,
                left: (frame.w - imgSize.w * scale) / 2 + offset.x,
                top: (frame.h - imgSize.h * scale) / 2 + offset.y,
                maxWidth: 'none',
                userSelect: 'none',
                pointerEvents: 'none',
              }}
            />
          ) : (
            <span className="dni-crop-loading">Cargando…</span>
          )}
        </div>

        <div className="dni-crop-zoom">
          <span aria-hidden>−</span>
          <input
            type="range"
            min={minScale}
            max={maxScale}
            step={(maxScale - minScale) / 100 || 0.01}
            value={scale}
            disabled={!ready}
            onChange={(e) => onScaleChange(e.target.value)}
          />
          <span aria-hidden>+</span>
        </div>

        <div className="dni-crop-actions">
          <button type="button" className="dni-crop-btn dni-crop-btn--ghost" onClick={onCancel} disabled={exporting}>
            Cancelar
          </button>
          <button
            type="button"
            className="dni-crop-btn dni-crop-btn--primary"
            onClick={exportCrop}
            disabled={!ready || exporting}
          >
            {exporting ? 'Procesando…' : 'Usar esta foto'}
          </button>
        </div>
      </div>
    </div>
  );
}
