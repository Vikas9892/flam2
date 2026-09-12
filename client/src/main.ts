import { CanvasEngine } from "./canvas/canvas";
import { TopBar } from "./ui/topbar";
import { Toolbar } from "./ui/toolbar";
import { BottomBar } from "./ui/bottombar";
import { PerformanceHUD } from "./ui/performance-panel";
import { setupKeyboardShortcuts } from "./ui/keyboard";
import { showToast } from "./ui/toast";
import { SocketClient } from "./collaboration/socket";
import { PresenceManager } from "./collaboration/presence";
import { ClientHistory } from "./state/history";
import { FreehandStroke, ShapeStroke } from "./types";
import { exportCanvasAsPng } from "./canvas/export";

// Parse or generate room ID
const urlParams = new URLSearchParams(window.location.search);
let roomId = urlParams.get("room") || window.location.hash.replace("#", "");
if (!roomId) {
  roomId = "design-sprint";
  const newUrl = new URL(window.location.href);
  newUrl.searchParams.set("room", roomId);
  window.history.replaceState({}, "", newUrl.toString());
}

const appEl = document.getElementById("app");
const container = document.getElementById("canvas-container");
const presenceLayer = document.getElementById("presence-layer");
if (!appEl || !container || !presenceLayer) {
  throw new Error("Missing required canvas or presence container elements");
}

// 1. Performance HUD
export const perfHud = new PerformanceHUD();

// 2. Client History Manager (canonical append-only operation log)
export const clientHistory = new ClientHistory();

// 3. Presence Manager (Layer 3 DOM)
export const presenceManager = new PresenceManager(presenceLayer);

// 4. Canvas Engine with collaboration callbacks
export const canvasEngine = new CanvasEngine(
  container,
  {
    onStrokeStart: (stroke) => {
      socketClient.emitStrokeStart(stroke);
    },
    onStrokePoints: (strokeId, points) => {
      socketClient.emitStrokePoints(strokeId, points);
    },
    onStrokeEnd: (stroke) => {
      socketClient.commitStroke(stroke.id, stroke);
      socketClient.emitStrokeEnd(stroke.id);
    },
    onCursorMove: (worldPoint) => {
      socketClient.emitCursor(worldPoint);
    },
    onViewportChange: (viewport) => {
      presenceManager.positionAll(viewport);
    }
  },
  presenceLayer
);

// 5. Top Bar
export const topBar = new TopBar(appEl, roomId, "Design Sprint", (newName) => {
  document.title = `CanvasFlow - ${newName}`;
  showToast(`Room renamed to "${newName}"`);
});

// 6. Vertical Toolbar + Properties Panel
export const toolbar = new Toolbar(container, canvasEngine);

// 7. Bottom Controls Bar
export const bottomBar = new BottomBar(appEl, canvasEngine, perfHud, {
  onUndo: () => {
    socketClient.undo();
  },
  onRedo: () => {
    socketClient.redo();
  },
  onClear: () => {
    if (confirm("Clear all drawings on the canvas?")) {
      canvasEngine.clearCanvas();
      showToast("Canvas cleared");
    }
  },
  onExport: () => {
    exportCanvasAsPng(canvasEngine.getCommittedStrokes(), roomId);
  }
});

// 8. Socket Collaboration Client
export const socketClient = new SocketClient(roomId, {
  onStatusChange: (status) => {
    topBar.setConnectionStatus(status);
  },
  onLatencyUpdate: (ms) => {
    topBar.setLatency(ms);
    perfHud.setLatency(ms);
  },
  onRoomState: (state) => {
    topBar.updateParticipants(
      state.participants.map((p) => ({
        userId: p.userId,
        name: p.name,
        color: p.color,
        isSelf: p.userId === state.self.userId
      }))
    );
    perfHud.setUsersCount(state.participants.length);

    // Synchronize history and active strokes
    if (Array.isArray(state.operations)) {
      clientHistory.setOperations(state.operations);
      socketClient.lastKnownRevision = clientHistory.lastAppliedRevision;
      canvasEngine.setCommittedStrokes(clientHistory.getActiveStrokes());
      perfHud.setOpsCount(clientHistory.getAllOperations().length);
      bottomBar.setHistoryState(clientHistory.canUndo(), clientHistory.canRedo());
    }

    // Adopt assigned color for local user
    if (state.self.color) {
      toolbar.setColor(state.self.color);
    }
    showToast(`Joined room #${state.roomId} as ${state.self.name}`);
  },
  onRoomDelta: (delta) => {
    if (Array.isArray(delta.operations)) {
      for (const op of delta.operations) {
        clientHistory.applyOperation(op);
      }
      socketClient.lastKnownRevision = clientHistory.lastAppliedRevision;
      canvasEngine.setCommittedStrokes(clientHistory.getActiveStrokes());
      perfHud.setOpsCount(clientHistory.getAllOperations().length);
      bottomBar.setHistoryState(clientHistory.canUndo(), clientHistory.canRedo());
      showToast(`Reconnected! Synced ${delta.operations.length} missed operations.`);
    }
  },
  onRoomSnapshot: (snapshot) => {
    if (Array.isArray(snapshot.operations)) {
      clientHistory.setOperations(snapshot.operations);
      socketClient.lastKnownRevision = clientHistory.lastAppliedRevision;
      canvasEngine.setCommittedStrokes(clientHistory.getActiveStrokes());
      perfHud.setOpsCount(clientHistory.getAllOperations().length);
      bottomBar.setHistoryState(clientHistory.canUndo(), clientHistory.canRedo());
      showToast("Reconnected! Synced room snapshot.");
    }
  },
  onUserJoined: (user) => {
    showToast(`${user.name} joined the room`);
    const all = socketClient.getParticipantsList();
    topBar.updateParticipants(
      all.map((p) => ({
        userId: p.userId,
        name: p.name,
        color: p.color,
        isSelf: p.userId === socketClient.currentUser?.userId
      }))
    );
    perfHud.setUsersCount(all.length);
  },
  onUserLeft: (userId) => {
    presenceManager.removeCursor(userId);
    const all = socketClient.getParticipantsList();
    topBar.updateParticipants(
      all.map((p) => ({
        userId: p.userId,
        name: p.name,
        color: p.color,
        isSelf: p.userId === socketClient.currentUser?.userId
      }))
    );
    perfHud.setUsersCount(all.length);
  },
  onRemoteCursor: (payload) => {
    presenceManager.updateCursor(
      payload.userId,
      payload.userName,
      payload.color,
      payload.worldX,
      payload.worldY,
      canvasEngine.viewport
    );
  },
  onRemoteStrokeStart: (payload) => {
    const startPoint = { x: payload.point[0], y: payload.point[1] };
    if (payload.tool === "brush" || payload.tool === "eraser") {
      const stroke: FreehandStroke = {
        id: payload.strokeId,
        userId: "remote",
        tool: payload.tool,
        style: { color: payload.color, width: payload.width },
        points: [startPoint]
      };
      if (payload.tool === "eraser") {
        canvasEngine.erasePointOnCommitted(startPoint, payload.width);
      }
      canvasEngine.updateRemoteActiveStroke(stroke);
    } else {
      const stroke: ShapeStroke = {
        id: payload.strokeId,
        userId: "remote",
        tool: payload.tool,
        style: { color: payload.color, width: payload.width },
        startPoint,
        endPoint: startPoint
      };
      canvasEngine.updateRemoteActiveStroke(stroke);
    }
  },
  onRemoteStrokePoints: (payload) => {
    const existing = canvasEngine.getRemoteActiveStroke(payload.strokeId);
    if (!existing) return;

    if (existing.tool === "brush" || existing.tool === "eraser") {
      const freehand = existing as FreehandStroke;
      payload.points.forEach((pt) => {
        const nextPoint = { x: pt[0], y: pt[1] };
        const prevPoint = freehand.points[freehand.points.length - 1];
        if (freehand.tool === "eraser" && prevPoint) {
          canvasEngine.eraseSegmentOnCommitted(prevPoint, nextPoint, freehand.style.width);
        }
        freehand.points.push(nextPoint);
      });
      canvasEngine.updateRemoteActiveStroke(freehand);
    } else {
      const shape = existing as ShapeStroke;
      const lastPoint = payload.points[payload.points.length - 1];
      if (lastPoint) {
        shape.endPoint = { x: lastPoint[0], y: lastPoint[1] };
        canvasEngine.updateRemoteActiveStroke(shape);
      }
    }
  },
  onRemoteStrokeEnd: (payload) => {
    canvasEngine.removeRemoteActiveStroke(payload.strokeId);
  },
  onOperationCommit: (operation) => {
    clientHistory.applyOperation(operation);
    canvasEngine.setCommittedStrokes(clientHistory.getActiveStrokes());
    perfHud.setOpsCount(clientHistory.getAllOperations().length);
    bottomBar.setHistoryState(clientHistory.canUndo(), clientHistory.canRedo());
  },
  onError: (msg) => {
    showToast(`Error: ${msg}`);
  },
  onMessageReceived: () => {
    perfHud.recordMessage();
  }
});

// 9. Keyboard Shortcuts
setupKeyboardShortcuts(toolbar, bottomBar, canvasEngine, {
  onUndo: () => socketClient.undo(),
  onRedo: () => socketClient.redo()
});

// Window debug handles
(window as unknown as {
  canvasEngine: CanvasEngine;
  topBar: TopBar;
  toolbar: Toolbar;
  bottomBar: BottomBar;
  perfHud: PerformanceHUD;
  socketClient: SocketClient;
  presenceManager: PresenceManager;
  clientHistory: ClientHistory;
}).clientHistory = clientHistory;

console.log("[CanvasFlow] Server operation history wired.");
