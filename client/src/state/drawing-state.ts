import { Operation, DrawingStroke } from "../types";

export function deriveActiveStrokes(operations: Operation[]): DrawingStroke[] {
  const strokesMap = new Map<string, DrawingStroke>();
  const undoneIds = new Set<string>();

  // Operations must be processed in monotonically increasing revision order
  const sorted = [...operations].sort((a, b) => a.revision - b.revision);

  for (const op of sorted) {
    if (op.type === "stroke") {
      const stroke = op.payload as DrawingStroke;
      strokesMap.set(op.id, stroke);
    } else if (op.type === "undo") {
      const targetId = (op.payload as { targetOperationId: string }).targetOperationId;
      undoneIds.add(targetId);
    } else if (op.type === "redo") {
      const targetId = (op.payload as { targetOperationId: string }).targetOperationId;
      undoneIds.delete(targetId);
    }
  }

  // Filter out any strokes that are currently marked undone
  const result: DrawingStroke[] = [];
  for (const op of sorted) {
    if (op.type === "stroke" && !undoneIds.has(op.id)) {
      const stroke = strokesMap.get(op.id);
      if (stroke) result.push(stroke);
    }
  }

  return result;
}
