import { io, Socket } from "socket.io-client";
import { UserInfo, RoomStatePayload, UserJoinedPayload, UserLeftPayload, PongPayload } from "../../../server/protocol";

export interface SocketClientCallbacks {
  onStatusChange?: (status: "connected" | "reconnecting" | "offline" | "connecting") => void;
  onLatencyUpdate?: (ms: number) => void;
  onRoomState?: (state: RoomStatePayload) => void;
  onUserJoined?: (user: UserInfo) => void;
  onUserLeft?: (userId: string) => void;
  onError?: (err: string) => void;
}

export class SocketClient {
  public socket: Socket;
  public currentUser: UserInfo | null = null;
  public participants: Map<string, UserInfo> = new Map();
  public currentRoomId: string;

  private callbacks: SocketClientCallbacks;
  private pingInterval: number | null = null;

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
      this.joinRoom(this.currentRoomId);
    });

    this.socket.on("room:state", (payload: RoomStatePayload) => {
      this.currentUser = payload.self;
      this.participants.clear();
      payload.participants.forEach((p) => {
        this.participants.set(p.userId, p);
      });
      this.callbacks.onRoomState?.(payload);
    });

    this.socket.on("presence:user-joined", (payload: UserJoinedPayload) => {
      this.participants.set(payload.user.userId, payload.user);
      this.callbacks.onUserJoined?.(payload.user);
    });

    this.socket.on("presence:user-left", (payload: UserLeftPayload) => {
      this.participants.delete(payload.userId);
      this.callbacks.onUserLeft?.(payload.userId);
    });

    this.socket.on("connection:pong", (payload: PongPayload) => {
      const latency = Math.max(0, Date.now() - payload.clientTime);
      this.callbacks.onLatencyUpdate?.(latency);
    });

    this.socket.on("room:error", (err: { message: string }) => {
      this.callbacks.onError?.(err.message);
    });
  }

  public joinRoom(roomId: string, requestedName?: string): void {
    this.currentRoomId = roomId;
    this.socket.emit("room:join", {
      roomId,
      user: requestedName ? { name: requestedName } : undefined
    });
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
