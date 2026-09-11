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

export interface UserInfo {
  userId: string;
  name: string;
  color: string;
}

export interface JoinRoomPayload {
  roomId: string;
  user?: {
    name?: string;
  };
}

export interface RoomStatePayload {
  roomId: string;
  self: UserInfo;
  participants: UserInfo[];
  revision: number;
  operations: Operation[];
}

export interface CommitStrokePayload {
  operationId: string;
  stroke: DrawingStroke;
}

export interface OperationCommitPayload {
  operation: Operation;
}

export interface UserJoinedPayload {
  user: UserInfo;
}

export interface UserLeftPayload {
  userId: string;
}

export interface CursorPayload {
  userId?: string;
  userName?: string;
  color?: string;
  worldX: number;
  worldY: number;
}

export interface PingPayload {
  clientTime: number;
}

export interface PongPayload {
  clientTime: number;
  serverTime: number;
}

// In-flight stroke streaming payloads
export type PointTuple = [number, number];

export interface StrokeStartPayload {
  strokeId: string;
  tool: "brush" | "eraser" | "line" | "rectangle" | "circle";
  color: string;
  width: number;
  point: PointTuple;
}

export interface StrokePointsPayload {
  strokeId: string;
  points: PointTuple[];
}

export interface StrokeEndPayload {
  strokeId: string;
}

// Input validation helpers
export function isValidRoomId(roomId: unknown): roomId is string {
  return typeof roomId === "string" && roomId.trim().length > 0 && roomId.length <= 64;
}

export function isValidUserName(name: unknown): name is string {
  return typeof name === "string" && name.trim().length > 0 && name.length <= 32;
}

export function isValidCoordinate(n: unknown): n is number {
  return typeof n === "number" && !isNaN(n) && isFinite(n) && Math.abs(n) < 1e7;
}

export function isValidStrokeWidth(w: unknown): w is number {
  return typeof w === "number" && !isNaN(w) && isFinite(w) && w >= 1 && w <= 100;
}

export function isValidHexColor(c: unknown): c is string {
  return typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);
}

export function isValidPointTuple(p: unknown): p is PointTuple {
  return (
    Array.isArray(p) &&
    p.length === 2 &&
    isValidCoordinate(p[0]) &&
    isValidCoordinate(p[1])
  );
}
