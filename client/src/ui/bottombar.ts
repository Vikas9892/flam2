import { CanvasEngine } from "../canvas/canvas";
import { PerformanceHUD } from "./performance-panel";

export interface BottomBarCallbacks {
  onUndo?: () => void;
  onRedo?: () => void;
  onExport?: () => void;
  onClear?: () => void;
}

export class BottomBar {
  private el: HTMLElement;
  private canvasEngine: CanvasEngine;
  private perfHud: PerformanceHUD;
  private zoomValEl: HTMLElement;
  private undoBtn: HTMLButtonElement;
  private redoBtn: HTMLButtonElement;

  private callbacks: BottomBarCallbacks;

  constructor(
    container: HTMLElement,
    canvasEngine: CanvasEngine,
    perfHud: PerformanceHUD,
    callbacks: BottomBarCallbacks = {}
  ) {
    this.canvasEngine = canvasEngine;
    this.perfHud = perfHud;
    this.callbacks = callbacks;

    this.el = document.createElement("div");
    this.el.className = "bottom-bar";
    this.el.innerHTML = `
      <!-- History Group -->
      <div class="bottom-group">
        <button class="bottom-btn" id="btn-undo" title="Undo [Ctrl+Z]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
        </button>
        <button class="bottom-btn" id="btn-redo" title="Redo [Ctrl+Y]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>
        </button>
      </div>

      <div class="bottom-divider"></div>

      <!-- Zoom Group -->
      <div class="bottom-group">
        <button class="bottom-btn" id="btn-zoom-out" title="Zoom Out [-]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <span class="zoom-indicator" id="zoom-indicator" title="Click to reset zoom [0]">100%</span>
        <button class="bottom-btn" id="btn-zoom-in" title="Zoom In [=]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>

      <div class="bottom-divider"></div>

      <!-- Actions Group -->
      <div class="bottom-group">
        <button class="bottom-btn" id="btn-export" title="Export as PNG">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>Export</span>
        </button>
        <button class="bottom-btn" id="btn-clear" title="Clear Canvas">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          <span>Clear</span>
        </button>
      </div>

      <div class="bottom-divider"></div>

      <!-- Performance Toggle -->
      <div class="bottom-group">
        <button class="bottom-btn" id="btn-perf-toggle" title="Toggle Performance HUD">
          <span>⌁ Perf</span>
        </button>
      </div>
    `;

    container.appendChild(this.el);

    this.zoomValEl = this.el.querySelector("#zoom-indicator")!;
    this.undoBtn = this.el.querySelector("#btn-undo")!;
    this.redoBtn = this.el.querySelector("#btn-redo")!;

    this.bindEvents();
  }

  private bindEvents(): void {
    this.undoBtn.addEventListener("click", () => {
      if (this.callbacks.onUndo) this.callbacks.onUndo();
    });

    this.redoBtn.addEventListener("click", () => {
      if (this.callbacks.onRedo) this.callbacks.onRedo();
    });

    this.el.querySelector("#btn-zoom-in")?.addEventListener("click", () => {
      this.canvasEngine.setZoom(this.canvasEngine.viewport.zoom * 1.25);
      this.updateZoomDisplay();
    });

    this.el.querySelector("#btn-zoom-out")?.addEventListener("click", () => {
      this.canvasEngine.setZoom(this.canvasEngine.viewport.zoom * 0.8);
      this.updateZoomDisplay();
    });

    this.zoomValEl.addEventListener("click", () => {
      this.canvasEngine.resetViewport();
      this.updateZoomDisplay();
    });

    this.el.querySelector("#btn-export")?.addEventListener("click", () => {
      if (this.callbacks.onExport) this.callbacks.onExport();
    });

    this.el.querySelector("#btn-clear")?.addEventListener("click", () => {
      if (this.callbacks.onClear) this.callbacks.onClear();
    });

    this.el.querySelector("#btn-perf-toggle")?.addEventListener("click", () => {
      this.perfHud.toggle();
    });
  }

  public updateZoomDisplay(): void {
    const pct = Math.round(this.canvasEngine.viewport.zoom * 100);
    this.zoomValEl.textContent = `${pct}%`;
  }

  public setHistoryState(canUndo: boolean, canRedo: boolean): void {
    this.undoBtn.disabled = !canUndo;
    this.redoBtn.disabled = !canRedo;
  }
}
