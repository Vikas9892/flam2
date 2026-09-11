import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

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
  console.log(`[Socket] Client connected: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, () => {
    console.log(`[Server] CanvasFlow server running on http://localhost:${PORT}`);
  });
}

export { app, server, io };
