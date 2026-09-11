export type Point = {
  x: number;
  y: number;
};

export type ToolType = "brush" | "eraser" | "line" | "rectangle" | "circle" | "hand";

export interface StrokeStyle {
  color: string;
  width: number;
  opacity?: number;
}

export interface ViewportTransform {
  panX: number;
  panY: number;
  zoom: number;
}

export interface BaseDrawingOperation {
  id: string;
  userId: string;
  tool: ToolType;
  style: StrokeStyle;
}

export interface FreehandStroke extends BaseDrawingOperation {
  tool: "brush" | "eraser";
  points: Point[];
}

export interface ShapeStroke extends BaseDrawingOperation {
  tool: "line" | "rectangle" | "circle";
  startPoint: Point;
  endPoint: Point;
}

export type DrawingStroke = FreehandStroke | ShapeStroke;

export interface Operation {
  id: string;
  revision: number;
  authorId: string;
  type: "stroke" | "undo" | "redo";
  payload: DrawingStroke | { targetOperationId: string };
  timestamp: number;
}

export interface CollaboratorCursor {
  userId: string;
  userName: string;
  color: string;
  worldX: number;
  worldY: number;
  lastActive: number;
}
