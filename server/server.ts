import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import { roomManager } from "./rooms.js";
import {
  JoinRoomPayload,
  isValidRoomId,
  isValidUserName,
  isValidHexColor,
  isValidStrokeWidth,
  isValidPointTuple,
  PingPayload,
  PongPayload
} from "./protocol.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === "production" ? false : ["http://localhost:5173"],
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Serve static client bundle in production
const clientDistPath = path.resolve(__dirname, "../client");
app.use(express.static(clientDistPath));

// Fallback for SPA routing in production
app.get("*", (_req, res, next) => {
  const indexPath = path.join(clientDistPath, "index.html");
  res.sendFile(indexPath, (err) => {
    if (err) next();
  });
});

io.on("connection", (socket) => {
  // Latency ping/pong
  socket.on("connection:ping", (payload: PingPayload) => {
    if (typeof payload?.clientTime === "number") {
      const pong: PongPayload = {
        clientTime: payload.clientTime,
        serverTime: Date.now()
      };
      socket.emit("connection:pong", pong);
    }
  });

  // Room join
  socket.on("room:join", (payload: JoinRoomPayload) => {
    if (!payload || !isValidRoomId(payload.roomId)) {
      socket.emit("room:error", { message: "Invalid room ID" });
      return;
    }

    const requestedName = isValidUserName(payload.user?.name) ? payload.user.name : undefined;
    const { room, user } = roomManager.joinRoom(payload.roomId, socket.id, requestedName);

    socket.join(room.id);

    // Send initial room state to the joining user
    socket.emit("room:state", {
      roomId: room.id,
      self: user,
      participants: room.getParticipants(),
      revision: room.revision
    });

    // Broadcast presence update to other peers in the room
    socket.to(room.id).emit("presence:user-joined", { user });
  });

  // Transient stroke streaming
  socket.on("stroke:start", (payload: any) => {
    const room = roomManager.getRoomForUser(socket.id);
    if (!room) return;

    if (
      !payload ||
      typeof payload.strokeId !== "string" ||
      !["brush", "eraser", "line", "rectangle", "circle"].includes(payload.tool) ||
      !isValidHexColor(payload.color) ||
      !isValidStrokeWidth(payload.width) ||
      !isValidPointTuple(payload.point)
    ) {
      return;
    }

    socket.to(room.id).emit("stroke:start", payload);
  });

  socket.on("stroke:points", (payload: any) => {
    const room = roomManager.getRoomForUser(socket.id);
    if (!room) return;

    if (
      !payload ||
      typeof payload.strokeId !== "string" ||
      !Array.isArray(payload.points) ||
      payload.points.length > 200 ||
      !payload.points.every(isValidPointTuple)
    ) {
      return;
    }

    socket.to(room.id).emit("stroke:points", payload);
  });

  socket.on("stroke:end", (payload: any) => {
    const room = roomManager.getRoomForUser(socket.id);
    if (!room) return;

    if (!payload || typeof payload.strokeId !== "string") {
      return;
    }

    socket.to(room.id).emit("stroke:end", payload);
  });

  // Disconnect handler
  socket.on("disconnect", () => {
    const { room, user } = roomManager.leaveRoom(socket.id);
    if (room && user) {
      socket.to(room.id).emit("presence:user-left", { userId: user.userId });
    }
  });
});

if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, () => {
    console.log(`[Server] CanvasFlow server running on http://localhost:${PORT}`);
  });
}

export { app, server, io };
