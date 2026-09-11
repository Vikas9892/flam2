import { DrawingStroke, FreehandStroke, ShapeStroke } from "../types";
import { renderStroke } from "./renderer";
import { showToast } from "../ui/toast";

export function exportCanvasAsPng(
  strokes: DrawingStroke[],
  roomId: string = "canvasflow",
  backgroundColor: string = "#0f1117"
): void {
  if (strokes.length === 0) {
    showToast("Canvas is empty! Draw something first.");
    return;
  }

  // Calculate bounding box of all strokes in world coordinates
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const stroke of strokes) {
    const halfWidth = (stroke.style.width || 4) / 2;

    if (stroke.tool === "brush" || stroke.tool === "eraser") {
      const freehand = stroke as FreehandStroke;
      for (const p of freehand.points) {
        minX = Math.min(minX, p.x - halfWidth);
        minY = Math.min(minY, p.y - halfWidth);
        maxX = Math.max(maxX, p.x + halfWidth);
        maxY = Math.max(maxY, p.y + halfWidth);
      }
    } else {
      const shape = stroke as ShapeStroke;
      minX = Math.min(minX, shape.startPoint.x - halfWidth, shape.endPoint.x - halfWidth);
      minY = Math.min(minY, shape.startPoint.y - halfWidth, shape.endPoint.y - halfWidth);
      maxX = Math.max(maxX, shape.startPoint.x + halfWidth, shape.endPoint.x + halfWidth);
      maxY = Math.max(maxY, shape.startPoint.y + halfWidth, shape.endPoint.y + halfWidth);
    }
  }

  // Add 40px margin around artwork
  const padding = 40;
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;

  const width = Math.max(200, Math.ceil(maxX - minX));
  const height = Math.max(200, Math.ceil(maxY - minY));

  // Create temporary export canvas at 2x scale for sharp output
  const scale = 2;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = width * scale;
  exportCanvas.height = height * scale;

  const ctx = exportCanvas.getContext("2d");
  if (!ctx) {
    showToast("Failed to initialize export canvas");
    return;
  }

  ctx.scale(scale, scale);

  // Fill background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  // Translate coordinates so minX, minY maps to (0, 0)
  ctx.translate(-minX, -minY);

  // Render all committed strokes
  for (const stroke of strokes) {
    renderStroke(ctx, stroke);
  }

  // Generate data URL and download
  const dataUrl = exportCanvas.toDataURL("image/png");
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  link.download = `canvasflow-${roomId}-${timestamp}.png`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  link.remove();

  showToast("Canvas exported successfully as PNG!");
}
