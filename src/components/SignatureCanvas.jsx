import { useRef, useEffect, useState, useCallback } from 'react';
import { Eraser, Check } from 'lucide-react';

/**
 * SignatureCanvas
 * Captura la firma manuscrita del deudor sobre un canvas táctil.
 * Expone los vectores de la firma como dataURL (PNG) para incrustar en el PDF.
 */
export default function SignatureCanvas({ onConfirm, disabled }) {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef(null);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctx.scale(ratio, ratio);
    ctx.strokeStyle = '#042f2c';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const getPoint = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDraw = useCallback((e) => {
    if (disabled) return;
    e.preventDefault();
    isDrawing.current = true;
    lastPoint.current = getPoint(e);
  }, [disabled]);

  const draw = useCallback((e) => {
    if (!isDrawing.current || disabled) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const point = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPoint.current = point;
    setHasSignature(true);
  }, [disabled]);

  const endDraw = useCallback(() => {
    isDrawing.current = false;
  }, []);

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const confirm = () => {
    if (!hasSignature) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    onConfirm(dataUrl);
  };

  return (
    <div>
      <div className="relative folio-border rounded-none bg-white ruled-lines">
        <canvas
          ref={canvasRef}
          className="w-full h-40 touch-none cursor-crosshair"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
          aria-label="Área para dibujar su firma"
        />
        {!hasSignature && (
          <span className="absolute inset-0 flex items-center justify-center text-sm text-notary-ink/30 font-serif italic pointer-events-none">
            Firme aquí con el dedo o el mouse
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 mt-3">
        <button
          type="button"
          onClick={clear}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 text-sm text-notary-ink/60 hover:text-notary-ink px-3 py-1.5 transition-colors disabled:opacity-40"
        >
          <Eraser size={14} /> Borrar
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={!hasSignature || disabled}
          className="ml-auto inline-flex items-center gap-2 bg-notary-ink text-notary-paperWarm px-5 py-2.5 text-sm font-medium tracking-wide hover:bg-notary-inkLight transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Check size={16} /> Aceptar y firmar
        </button>
      </div>
    </div>
  );
}
