import { UserInfo } from "./protocol.js";
import { RoomHistory } from "./history.js";

const USER_COLORS = [
  "#6366f1", // Indigo
  "#ec4899", // Pink
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#3b82f6", // Blue
  "#8b5cf6", // Purple
  "#14b8a6", // Teal
  "#f43f5e"  // Rose
];

const ANIMAL_NAMES = [
  "Falcon", "Otter", "Fox", "Panda", "Koala", "Hawk", "Badger", "Lynx", "Dolphin", "Eagle"
];

export class Room {
  public id: string;
  public users: Map<string, UserInfo> = new Map();
  public revision: number = 0;
  public history: RoomHistory = new RoomHistory();
  public cleanupTimer: NodeJS.Timeout | null = null;
  private colorIndex: number = 0;

  constructor(id: string) {
    this.id = id;
  }

  public addUser(socketId: string, requestedName?: string): UserInfo {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    const assignedColor = USER_COLORS[this.colorIndex % USER_COLORS.length];
    this.colorIndex++;

    const randomAnimal = ANIMAL_NAMES[Math.floor(Math.random() * ANIMAL_NAMES.length)];
    const displayName = requestedName?.trim() || `Guest ${randomAnimal}`;

    const userInfo: UserInfo = {
      userId: socketId,
      name: displayName,
      color: assignedColor
    };

    this.users.set(socketId, userInfo);
    return userInfo;
  }

  public removeUser(socketId: string): UserInfo | undefined {
    const user = this.users.get(socketId);
    this.users.delete(socketId);
    return user;
  }

  public getParticipants(): UserInfo[] {
    return Array.from(this.users.values());
  }

  public isEmpty(): boolean {
    return this.users.size === 0;
  }
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private userToRoom: Map<string, string> = new Map();
  private CLEANUP_DELAY_MS = 10 * 60 * 1000; // 10 minutes

  public getOrCreateRoom(roomId: string): Room {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = new Room(roomId);
      this.rooms.set(roomId, room);
    }
    return room;
  }

  public getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  public getRoomForUser(socketId: string): Room | undefined {
    const roomId = this.userToRoom.get(socketId);
    if (!roomId) return undefined;
    return this.rooms.get(roomId);
  }

  public joinRoom(roomId: string, socketId: string, requestedName?: string): { room: Room; user: UserInfo } {
    // Leave previous room if any
    this.leaveRoom(socketId);

    const room = this.getOrCreateRoom(roomId);
    const user = room.addUser(socketId, requestedName);
    this.userToRoom.set(socketId, roomId);

    return { room, user };
  }

  public leaveRoom(socketId: string): { room?: Room; user?: UserInfo } {
    const roomId = this.userToRoom.get(socketId);
    if (!roomId) return {};

    this.userToRoom.delete(socketId);
    const room = this.rooms.get(roomId);
    if (!room) return {};

    const user = room.removeUser(socketId);

    if (room.isEmpty()) {
      // Schedule cleanup
      room.cleanupTimer = setTimeout(() => {
        if (room.isEmpty()) {
          this.rooms.delete(roomId);
          console.log(`[RoomManager] Cleaned up inactive empty room: ${roomId}`);
        }
      }, this.CLEANUP_DELAY_MS);
    }

    return { room, user };
  }
}

export const roomManager = new RoomManager();
