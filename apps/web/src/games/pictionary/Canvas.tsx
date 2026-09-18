import { useEffect, useRef } from 'react';
import { decimateStroke, type Stroke, type StrokePoint } from './game';
import { pushStroke, watchStrokes } from './firebase';

const COLOR = '#1a1511';
const WIDTH = 4;

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, w: number, h: number) {
  if (stroke.points.length < 2) return;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const [x0, y0] = stroke.points[0];
  ctx.moveTo(x0 * w, y0 * h);
  for (const [x, y] of stroke.points.slice(1)) ctx.lineTo(x * w, y * h);
  ctx.stroke();
}

/** Shared drawing surface: replays round history on mount/round-change, and
 * lets the artist draw, buffering points locally and writing one compact
 * stroke to Firebase per pointerup (see game.ts's decimateStroke). */
export function Canvas({ code, round, canDraw }: { code: string; round: number; canDraw: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bufferRef = useRef<StrokePoint[]>([]);
  const drawingRef = useRef(false);
  const seqRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return watchStrokes(code, round, (stroke) => drawStroke(ctx, stroke, canvas.width, canvas.height));
  }, [code, round]);

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>): StrokePoint {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))];
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!canDraw) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drawingRef.current = true;
    bufferRef.current = [pointFromEvent(e)];
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!canDraw || !drawingRef.current) return;
    const point = pointFromEvent(e);
    bufferRef.current.push(point);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || bufferRef.current.length < 2) return;
    const [px, py] = bufferRef.current[bufferRef.current.length - 2];
    ctx.strokeStyle = COLOR;
    ctx.lineWidth = WIDTH;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px * canvas.width, py * canvas.height);
    ctx.lineTo(point[0] * canvas.width, point[1] * canvas.height);
    ctx.stroke();
  }

  function onPointerUp() {
    if (!canDraw || !drawingRef.current) return;
    drawingRef.current = false;
    const points = decimateStroke(bufferRef.current);
    bufferRef.current = [];
    if (points.length < 2) return;
    seqRef.current += 1;
    pushStroke(code, round, { seq: seqRef.current, points, color: COLOR, width: WIDTH }).catch(() => {});
  }

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={600}
      className="pg-canvas"
      style={{ touchAction: 'none', cursor: canDraw ? 'crosshair' : 'default' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerUp}
    />
  );
}
