import { io, Socket } from "socket.io-client";
import {
  UserInfo,
  RoomStatePayload,
  UserJoinedPayload,
  UserLeftPayload,
  PongPayload,
  StrokeStartPayload,
  StrokePointsPayload,
  StrokeEndPayload
} from "../../../server/protocol";
import { DrawingStroke, Point, FreehandStroke, ShapeStroke } from "../types";

export interface SocketClientCallbacks {
  onStatusChange?: (status: "connected" | "reconnecting" | "offline" | "connecting") => void;
  onLatencyUpdate?: (ms: number) => void;
  onRoomState?: (state: RoomStatePayload) => void;
  onRoomDelta?: (delta: any) => void;
  onRoomSnapshot?: (snapshot: any) => void;
  onUserJoined?: (user: UserInfo) => void;
  onUserLeft?: (userId: string) => void;
  onRemoteStrokeStart?: (payload: StrokeStartPayload) => void;
  onRemoteStrokePoints?: (payload: StrokePointsPayload) => void;
  onRemoteStrokeEnd?: (payload: StrokeEndPayload) => void;
  onRemoteCursor?: (payload: { userId: string; userName: string; color: string; worldX: number; worldY: number }) => void;
  onOperationCommit?: (operation: any) => void;
  onError?: (err: string) => void;
  onMessageReceived?: () => void;
}

export class SocketClient {
  public socket: Socket;
  public currentUser: UserInfo | null = null;
  public participants: Map<string, UserInfo> = new Map();
  public currentRoomId: string;

  private callbacks: SocketClientCallbacks;
  private pingInterval: number | null = null;

  // Stroke point batch buffer
  private pointBatchBuffer: Map<string, Point[]> = new Map();
  private batchFlushTimer: number | null = null;

  constructor(roomId: string, callbacks: SocketClientCallbacks = {}) {
    this.currentRoomId = roomId;
    this.callbacks = callbacks;

    // Connect to same origin in production or dev proxy
    this.socket = io({
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    this.bindEvents();
  }

  private bindEvents(): void {
    this.socket.on("connect", () => {
      this.callbacks.onStatusChange?.("connected");
      this.joinRoom(this.currentRoomId);
      this.startPing();
    });

    this.socket.on("disconnect", (reason) => {
      if (reason === "io server disconnect") {
        this.socket.connect();
      }
      this.callbacks.onStatusChange?.("offline");
      this.stopPing();
    });

    this.socket.io.on("reconnect_attempt", () => {
      this.callbacks.onStatusChange?.("reconnecting");
    });

    this.socket.io.on("reconnect", () => {
      this.callbacks.onStatusChange?.("connected");
      this.resumeRoom(this.currentRoomId, this.lastKnownRevision);
    });

    this.socket.on("room:state", (payload: RoomStatePayload) => {
      this.callbacks.onMessageReceived?.();
      this.currentUser = payload.self;
      this.participants.clear();
      payload.participants.forEach((p) => {
        this.participants.set(p.userId, p);
      });
      this.callbacks.onRoomState?.(payload);
    });

    this.socket.on("room:delta", (payload: any) => {
      this.callbacks.onMessageReceived?.();
      this.callbacks.onRoomDelta?.(payload);
    });

    this.socket.on("room:snapshot", (payload: any) => {
      this.callbacks.onMessageReceived?.();
      this.callbacks.onRoomSnapshot?.(payload);
    });

    this.socket.on("presence:user-joined", (payload: UserJoinedPayload) => {
      this.callbacks.onMessageReceived?.();
      this.participants.set(payload.user.userId, payload.user);
      this.callbacks.onUserJoined?.(payload.user);
    });

    this.socket.on("presence:user-left", (payload: UserLeftPayload) => {
      this.callbacks.onMessageReceived?.();
      this.participants.delete(payload.userId);
      this.callbacks.onUserLeft?.(payload.userId);
    });

    this.socket.on("stroke:start", (payload: StrokeStartPayload) => {
      this.callbacks.onMessageReceived?.();
      this.callbacks.onRemoteStrokeStart?.(payload);
    });

    this.socket.on("stroke:points", (payload: StrokePointsPayload) => {
      this.callbacks.onMessageReceived?.();
      this.callbacks.onRemoteStrokePoints?.(payload);
    });

    this.socket.on("stroke:end", (payload: StrokeEndPayload) => {
      this.callbacks.onMessageReceived?.();
      this.callbacks.onRemoteStrokeEnd?.(payload);
    });

    this.socket.on("presence:cursor", (payload: any) => {
      this.callbacks.onMessageReceived?.();
      this.callbacks.onRemoteCursor?.(payload);
    });

    this.socket.on("operation:commit", (payload: any) => {
      this.callbacks.onMessageReceived?.();
      if (payload?.operation) {
        this.callbacks.onOperationCommit?.(payload.operation);
      }
    });

    this.socket.on("connection:pong", (payload: PongPayload) => {
      this.callbacks.onMessageReceived?.();
      const latency = Math.max(0, Date.now() - payload.clientTime);
      this.callbacks.onLatencyUpdate?.(latency);
    });

    this.socket.on("room:error", (err: { message: string }) => {
      this.callbacks.onError?.(err.message);
    });
  }

  public lastKnownRevision: number = 0;

  public joinRoom(roomId: string, requestedName?: string): void {
    this.currentRoomId = roomId;
    this.socket.emit("room:join", {
      roomId,
      user: requestedName ? { name: requestedName } : undefined
    });
  }

  public resumeRoom(roomId: string, lastAppliedRevision: number): void {
    this.currentRoomId = roomId;
    this.socket.emit("room:resume", {
      roomId,
      lastAppliedRevision
    });
  }

  public emitStrokeStart(stroke: DrawingStroke): void {
    let startPoint: Point;
    if (stroke.tool === "brush" || stroke.tool === "eraser") {
      startPoint = (stroke as FreehandStroke).points[0];
    } else {
      startPoint = (stroke as ShapeStroke).startPoint;
    }

    if (!startPoint) return;

    const payload: StrokeStartPayload = {
      strokeId: stroke.id,
      tool: stroke.tool,
      color: stroke.style.color,
      width: stroke.style.width,
      point: [startPoint.x, startPoint.y]
    };

    this.socket.emit("stroke:start", payload);
  }

  public emitStrokePoints(strokeId: string, points: Point[]): void {
    let buffer = this.pointBatchBuffer.get(strokeId);
    if (!buffer) {
      buffer = [];
      this.pointBatchBuffer.set(strokeId, buffer);
    }
    buffer.push(...points);

    // Schedule batch flush every ~30ms (approx 33 fps network updates)
    if (!this.batchFlushTimer) {
      this.batchFlushTimer = window.setTimeout(() => {
        this.flushPointBatches();
      }, 30);
    }
  }

  private flushPointBatches(): void {
    this.batchFlushTimer = null;
    for (const [strokeId, points] of this.pointBatchBuffer.entries()) {
      if (points.length > 0) {
        const payload: StrokePointsPayload = {
          strokeId,
          points: points.map((p) => [p.x, p.y])
        };
        this.socket.emit("stroke:points", payload);
      }
    }
    this.pointBatchBuffer.clear();
  }

  public emitStrokeEnd(strokeId: string): void {
    // Flush any pending points first
    this.flushPointBatches();

    const payload: StrokeEndPayload = { strokeId };
    this.socket.emit("stroke:end", payload);
  }

  private lastCursorEmit: number = 0;
  public emitCursor(worldPoint: Point): void {
    const now = Date.now();
    if (now - this.lastCursorEmit < 35) return;
    this.lastCursorEmit = now;

    if (this.socket.connected) {
      this.socket.emit("presence:cursor", {
        worldX: Math.round(worldPoint.x * 10) / 10,
        worldY: Math.round(worldPoint.y * 10) / 10
      });
    }
  }

  public commitStroke(operationId: string, stroke: DrawingStroke): void {
    if (this.socket.connected) {
      this.socket.emit("operation:commit-stroke", {
        operationId,
        stroke
      });
    }
  }

  public undo(): void {
    if (this.socket.connected) {
      this.socket.emit("history:undo");
    }
  }

  public redo(): void {
    if (this.socket.connected) {
      this.socket.emit("history:redo");
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingInterval = window.setInterval(() => {
      if (this.socket.connected) {
        this.socket.emit("connection:ping", { clientTime: Date.now() });
      }
    }, 3000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  public getParticipantsList(): UserInfo[] {
    return Array.from(this.participants.values());
  }
}
