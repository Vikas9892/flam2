import { CanvasEngine } from "./canvas/canvas";
import { TopBar } from "./ui/topbar";
import { Toolbar } from "./ui/toolbar";
import { BottomBar } from "./ui/bottombar";
import { PerformanceHUD } from "./ui/performance-panel";
import { setupKeyboardShortcuts } from "./ui/keyboard";
import { showToast } from "./ui/toast";
import { SocketClient } from "./collaboration/socket";

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
if (!appEl || !container) {
  throw new Error("Missing canvas container or app elements");
}

// 1. Performance HUD
export const perfHud = new PerformanceHUD();

// 2. Canvas Engine
export const canvasEngine = new CanvasEngine(container);

// 3. Top Bar
export const topBar = new TopBar(appEl, roomId, "Design Sprint", (newName) => {
  document.title = `CanvasFlow - ${newName}`;
  showToast(`Room renamed to "${newName}"`);
});

// 4. Vertical Toolbar + Properties Panel
export const toolbar = new Toolbar(container, canvasEngine);

// 5. Bottom Controls Bar
export const bottomBar = new BottomBar(appEl, canvasEngine, perfHud, {
  onUndo: () => {
    console.log("[CanvasFlow] Undo requested");
  },
  onRedo: () => {
    console.log("[CanvasFlow] Redo requested");
  },
  onClear: () => {
    if (confirm("Clear all drawings on the canvas?")) {
      canvasEngine.clearCanvas();
      showToast("Canvas cleared");
    }
  },
  onExport: () => {
    showToast("Preparing export...");
  }
});

// 6. Socket Collaboration Client
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

    // Adopt assigned color for local user
    if (state.self.color) {
      toolbar.setColor(state.self.color);
    }
    showToast(`Joined room #${state.roomId} as ${state.self.name}`);
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
  onUserLeft: (_userId) => {
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
  onError: (msg) => {
    showToast(`Error: ${msg}`);
  }
});

// 7. Keyboard Shortcuts
setupKeyboardShortcuts(toolbar, bottomBar, canvasEngine, {
  onUndo: () => console.log("[CanvasFlow] Undo requested"),
  onRedo: () => console.log("[CanvasFlow] Redo requested")
});

// Window debug handles
(window as unknown as {
  canvasEngine: CanvasEngine;
  topBar: TopBar;
  toolbar: Toolbar;
  bottomBar: BottomBar;
  perfHud: PerformanceHUD;
  socketClient: SocketClient;
}).socketClient = socketClient;

console.log("[CanvasFlow] Room collaboration wired.");
