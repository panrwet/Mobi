import { useEffect, useRef } from 'react';

/** Einfaches Unterschriftenfeld für Finger/Stift (Pointer Events) */
export function SignaturePad({ onSave, onCancel }: { onSave: (dataUrl: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const zeichnet = useRef(false);
  const leer = useRef(true);

  useEffect(() => {
    const c = ref.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111';
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  const down = (e: React.PointerEvent) => {
    ref.current!.setPointerCapture(e.pointerId);
    zeichnet.current = true;
    const ctx = ref.current!.getContext('2d')!;
    const [x, y] = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e: React.PointerEvent) => {
    if (!zeichnet.current) return;
    const ctx = ref.current!.getContext('2d')!;
    const [x, y] = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    leer.current = false;
  };
  const up = () => {
    zeichnet.current = false;
  };
  const loeschen = () => {
    const c = ref.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    leer.current = true;
  };

  return (
    <div>
      <canvas ref={ref} className="sigpad" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} aria-label="Unterschriftenfeld" />
      <div className="form-actions">
        <button type="button" className="btn small" onClick={loeschen}>
          Löschen
        </button>
        <button type="button" className="btn small" onClick={onCancel}>
          Abbrechen
        </button>
        <button type="button" className="btn small primary" onClick={() => !leer.current && onSave(ref.current!.toDataURL('image/png'))}>
          Übernehmen
        </button>
      </div>
    </div>
  );
}
