import { CanvasEngine } from "./canvas/canvas";

const container = document.getElementById("canvas-container");
if (!container) {
  throw new Error("Canvas container not found");
}

export const canvasEngine = new CanvasEngine(container);

// Expose canvas engine for testing and debugging
(window as unknown as { canvasEngine: CanvasEngine }).canvasEngine = canvasEngine;

console.log("CanvasFlow Canvas Engine initialized.");
