import { DrawingStroke, FreehandStroke, ShapeStroke, Point } from "../types";
import { Viewport } from "./viewport";

export function renderStroke(ctx: CanvasRenderingContext2D, stroke: DrawingStroke): void {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = stroke.style.width;

  if (stroke.tool === "eraser") {
    // For eraser on committed canvas, we use destination-out
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = stroke.style.color;
    ctx.fillStyle = stroke.style.color;
  }

  if (stroke.tool === "brush" || stroke.tool === "eraser") {
    renderFreehand(ctx, stroke as FreehandStroke);
  } else {
    renderShape(ctx, stroke as ShapeStroke);
  }

  ctx.restore();
}

function renderFreehand(ctx: CanvasRenderingContext2D, stroke: FreehandStroke): void {
  const points = stroke.points;
  if (!points || points.length === 0) return;

  if (points.length === 1) {
    const p = points[0];
    ctx.beginPath();
    ctx.arc(p.x, p.y, stroke.style.width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y);
    ctx.stroke();
    return;
  }

  // Smooth curve interpolation through midpoint quadratic bezier curves
  for (let i = 1; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
  }

  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

function renderShape(ctx: CanvasRenderingContext2D, stroke: ShapeStroke): void {
  const { startPoint, endPoint, tool } = stroke;
  if (!startPoint || !endPoint) return;

  ctx.beginPath();

  if (tool === "line") {
    ctx.moveTo(startPoint.x, startPoint.y);
    ctx.lineTo(endPoint.x, endPoint.y);
    ctx.stroke();
  } else if (tool === "rectangle") {
    const x = Math.min(startPoint.x, endPoint.x);
    const y = Math.min(startPoint.y, endPoint.y);
    const width = Math.abs(endPoint.x - startPoint.x);
    const height = Math.abs(endPoint.y - startPoint.y);
    ctx.strokeRect(x, y, width, height);
  } else if (tool === "circle") {
    const radiusX = Math.abs(endPoint.x - startPoint.x) / 2;
    const radiusY = Math.abs(endPoint.y - startPoint.y) / 2;
    const centerX = Math.min(startPoint.x, endPoint.x) + radiusX;
    const centerY = Math.min(startPoint.y, endPoint.y) + radiusY;

    if (radiusX > 0 && radiusY > 0) {
      ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

export function clearLayer(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  viewport: Viewport
): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  viewport.applyTransform(ctx);
}
