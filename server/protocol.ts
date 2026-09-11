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
}

export interface UserJoinedPayload {
  user: UserInfo;
}

export interface UserLeftPayload {
  userId: string;
}

export interface CursorPayload {
  userId?: string;
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
