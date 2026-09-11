import { ToolType } from "../types";
import { Toolbar } from "./toolbar";
import { BottomBar } from "./bottombar";
import { CanvasEngine } from "../canvas/canvas";

export interface KeyboardActions {
  onUndo?: () => void;
  onRedo?: () => void;
}

export function setupKeyboardShortcuts(
  toolbar: Toolbar,
  bottomBar: BottomBar,
  canvasEngine: CanvasEngine,
  actions: KeyboardActions = {}
): void {
  const toolShortcuts: Record<string, ToolType> = {
    b: "brush",
    e: "eraser",
    l: "line",
    r: "rectangle",
    c: "circle",
    h: "hand"
  };

  window.addEventListener("keydown", (e: KeyboardEvent) => {
    // If typing in an input or textarea, ignore shortcuts
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
      return;
    }

    const key = e.key.toLowerCase();

    // Undo / Redo
    if ((e.ctrlKey || e.metaKey) && key === "z") {
      e.preventDefault();
      if (e.shiftKey) {
        if (actions.onRedo) actions.onRedo();
      } else {
        if (actions.onUndo) actions.onUndo();
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && key === "y") {
      e.preventDefault();
      if (actions.onRedo) actions.onRedo();
      return;
    }

    // Zoom shortcuts
    if (key === "+" || key === "=") {
      e.preventDefault();
      canvasEngine.setZoom(canvasEngine.viewport.zoom * 1.25);
      bottomBar.updateZoomDisplay();
      return;
    }

    if (key === "-") {
      e.preventDefault();
      canvasEngine.setZoom(canvasEngine.viewport.zoom * 0.8);
      bottomBar.updateZoomDisplay();
      return;
    }

    if (key === "0") {
      e.preventDefault();
      canvasEngine.resetViewport();
      bottomBar.updateZoomDisplay();
      return;
    }

    // Tools
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      if (toolShortcuts[key]) {
        e.preventDefault();
        toolbar.selectTool(toolShortcuts[key]);
      }
    }
  });
}
