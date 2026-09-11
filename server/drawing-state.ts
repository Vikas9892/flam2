import {
  DrawingStroke,
  FreehandStroke,
  ShapeStroke,
  isValidHexColor,
  isValidStrokeWidth,
  isValidCoordinate
} from "./protocol.js";

export function validateStrokePayload(stroke: any): stroke is DrawingStroke {
  if (!stroke || typeof stroke !== "object") return false;
  if (typeof stroke.id !== "string" || stroke.id.length === 0 || stroke.id.length > 64) return false;
  if (!["brush", "eraser", "line", "rectangle", "circle"].includes(stroke.tool)) return false;

  if (!stroke.style || typeof stroke.style !== "object") return false;
  if (!isValidHexColor(stroke.style.color)) return false;
  if (!isValidStrokeWidth(stroke.style.width)) return false;

  if (stroke.tool === "brush" || stroke.tool === "eraser") {
    const freehand = stroke as FreehandStroke;
    if (!Array.isArray(freehand.points) || freehand.points.length === 0 || freehand.points.length > 10000) {
      return false;
    }
    for (const p of freehand.points) {
      if (!p || !isValidCoordinate(p.x) || !isValidCoordinate(p.y)) return false;
    }
  } else {
    const shape = stroke as ShapeStroke;
    if (!shape.startPoint || !isValidCoordinate(shape.startPoint.x) || !isValidCoordinate(shape.startPoint.y)) {
      return false;
    }
    if (!shape.endPoint || !isValidCoordinate(shape.endPoint.x) || !isValidCoordinate(shape.endPoint.y)) {
      return false;
    }
  }

  return true;
}
