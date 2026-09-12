import { ToolType, StrokeStyle, DrawingStroke, FreehandStroke, ShapeStroke, Point } from "../types";
import { Viewport } from "./viewport";
import { renderStroke, clearLayer } from "./renderer";
import { PerformanceProfiler } from "./perf";

export interface CanvasCallbacks {
  onStrokeStart?: (stroke: DrawingStroke) => void;
  onStrokePoints?: (strokeId: string, points: Point[]) => void;
  onStrokeEnd?: (stroke: DrawingStroke) => void;
  onCursorMove?: (worldPoint: Point) => void;
  onViewportChange?: (viewport: Viewport) => void;
}

export class CanvasEngine {
  public container: HTMLElement;
  public presenceLayer: HTMLElement | null = null;
  public committedCanvas: HTMLCanvasElement;
  public activeCanvas: HTMLCanvasElement;
  public committedCtx: CanvasRenderingContext2D;
  public activeCtx: CanvasRenderingContext2D;

  public viewport: Viewport;
  public activeTool: ToolType = "brush";
  public currentStyle: StrokeStyle = {
    color: "#818cf8",
    width: 4
  };

  // Tool cursor indicator
  private toolCursorEl: HTMLElement | null = null;
  private lastScreenPoint: Point = { x: -9999, y: -9999 };
  private isPointerInside: boolean = false;

  // State
  private isDrawing: boolean = false;
  private isPanning: boolean = false;
  private panStartScreen: Point = { x: 0, y: 0 };
  private localStroke: DrawingStroke | null = null;
  private committedStrokes: DrawingStroke[] = [];
  private remoteActiveStrokes: Map<string, DrawingStroke> = new Map();

  // Callbacks
  private callbacks: CanvasCallbacks;

  // Render loop flag
  private activeRenderPending: boolean = false;

  constructor(
    container: HTMLElement,
    callbacks: CanvasCallbacks = {},
    presenceLayer?: HTMLElement | null
  ) {
    this.container = container;
    this.presenceLayer = presenceLayer || container.querySelector("#presence-layer") || null;
    this.callbacks = callbacks;
    this.viewport = new Viewport();

    // Create Layer 1: Committed canvas
    this.committedCanvas = document.createElement("canvas");
    this.committedCanvas.className = "canvas-layer canvas-committed";

    // Create Layer 2: Active canvas
    this.activeCanvas = document.createElement("canvas");
    this.activeCanvas.className = "canvas-layer canvas-active";

    this.container.appendChild(this.committedCanvas);
    this.container.appendChild(this.activeCanvas);

    const cCtx = this.committedCanvas.getContext("2d");
    const aCtx = this.activeCanvas.getContext("2d");

    if (!cCtx || !aCtx) {
      throw new Error("Failed to initialize 2D canvas contexts");
    }

    this.committedCtx = cCtx;
    this.activeCtx = aCtx;

    this.initToolCursor();
    this.setupResizeObserver();
    this.bindEvents();
    this.updateToolCursor();
  }

  private initToolCursor(): void {
    if (!this.presenceLayer) return;
    this.toolCursorEl = document.createElement("div");
    this.toolCursorEl.className = "local-tool-cursor";
    this.toolCursorEl.id = "local-tool-cursor";

    const dot = document.createElement("div");
    dot.className = "cursor-center-dot";
    this.toolCursorEl.appendChild(dot);

    this.presenceLayer.appendChild(this.toolCursorEl);
  }

  public updateToolCursor(): void {
    if (!this.toolCursorEl) return;

    if ((this.activeTool === "brush" || this.activeTool === "eraser") && this.isPointerInside) {
      this.toolCursorEl.style.display = "block";
      this.toolCursorEl.className = `local-tool-cursor tool-${this.activeTool}`;

      // Screen diameter = width * zoom CSS pixels (independent of DPR)
      const diameter = Math.max(4, Math.round(this.currentStyle.width * this.viewport.zoom));
      this.toolCursorEl.style.width = `${diameter}px`;
      this.toolCursorEl.style.height = `${diameter}px`;
      this.toolCursorEl.style.setProperty("--cursor-color", this.currentStyle.color);

      const radius = diameter / 2;
      this.toolCursorEl.style.transform = `translate3d(${this.lastScreenPoint.x - radius}px, ${this.lastScreenPoint.y - radius}px, 0)`;
      this.activeCanvas.style.cursor = "none";
    } else {
      this.toolCursorEl.style.display = "none";
      if (this.activeTool === "hand") {
        this.activeCanvas.style.cursor = this.isPanning ? "grabbing" : "grab";
      } else {
        this.activeCanvas.style.cursor = "crosshair";
      }
    }
  }

  private setupResizeObserver(): void {
    const resize = () => {
      this.handleResize();
    };

    const observer = new ResizeObserver(() => resize());
    observer.observe(this.container);
    window.addEventListener("resize", resize);
    this.handleResize();
  }

  public handleResize(): void {
    const rect = this.container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    this.viewport.updateDpr();
    const dpr = this.viewport.dpr;

    // Set pixel backbuffer sizes
    this.committedCanvas.width = Math.round(rect.width * dpr);
    this.committedCanvas.height = Math.round(rect.height * dpr);
    this.activeCanvas.width = Math.round(rect.width * dpr);
    this.activeCanvas.height = Math.round(rect.height * dpr);

    // Set CSS display sizes
    this.committedCanvas.style.width = `${rect.width}px`;
    this.committedCanvas.style.height = `${rect.height}px`;
    this.activeCanvas.style.width = `${rect.width}px`;
    this.activeCanvas.style.height = `${rect.height}px`;

    this.redrawCommitted();
    this.requestActiveRender();
    this.updateToolCursor();
  }

  private bindEvents(): void {
    // Pointer Events on active canvas
    this.activeCanvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    this.activeCanvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
    this.activeCanvas.addEventListener("pointerup", (e) => this.onPointerUp(e));
    this.activeCanvas.addEventListener("pointercancel", (e) => this.onPointerCancel(e));

    this.activeCanvas.addEventListener("pointerenter", () => {
      this.isPointerInside = true;
      this.updateToolCursor();
    });

    this.activeCanvas.addEventListener("pointerleave", () => {
      if (!this.isDrawing) {
        this.isPointerInside = false;
        this.updateToolCursor();
      }
    });

    // Wheel for pan and zoom
    this.activeCanvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
  }

  private getScreenPoint(e: PointerEvent): Point {
    const rect = this.activeCanvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  // Live eraser helpers on Layer 1 (Committed Canvas)
  public erasePointOnCommitted(point: Point, width: number): void {
    this.viewport.applyTransform(this.committedCtx);
    this.committedCtx.save();
    this.committedCtx.globalCompositeOperation = "destination-out";
    this.committedCtx.fillStyle = "rgba(0,0,0,1)";
    this.committedCtx.beginPath();
    this.committedCtx.arc(point.x, point.y, width / 2, 0, Math.PI * 2);
    this.committedCtx.fill();
    this.committedCtx.restore();
  }

  public eraseSegmentOnCommitted(p1: Point, p2: Point, width: number): void {
    this.viewport.applyTransform(this.committedCtx);
    this.committedCtx.save();
    this.committedCtx.lineCap = "round";
    this.committedCtx.lineJoin = "round";
    this.committedCtx.lineWidth = width;
    this.committedCtx.globalCompositeOperation = "destination-out";
    this.committedCtx.strokeStyle = "rgba(0,0,0,1)";
    this.committedCtx.beginPath();
    this.committedCtx.moveTo(p1.x, p1.y);
    this.committedCtx.lineTo(p2.x, p2.y);
    this.committedCtx.stroke();
    this.committedCtx.restore();
  }

  private onPointerDown(e: PointerEvent): void {
    // Only handle primary button or middle button (for panning)
    if (e.button !== 0 && e.button !== 1) return;

    this.activeCanvas.setPointerCapture(e.pointerId);
    const screenPoint = this.getScreenPoint(e);
    const worldPoint = this.viewport.screenToWorld(screenPoint);
    this.lastScreenPoint = screenPoint;
    this.isPointerInside = true;
    this.updateToolCursor();

    if (this.activeTool === "hand" || e.button === 1 || e.spaceKey) {
      this.isPanning = true;
      this.panStartScreen = screenPoint;
      this.container.style.cursor = "grabbing";
      return;
    }

    this.isDrawing = true;
    const strokeId = "stroke_" + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);

    if (this.activeTool === "brush" || this.activeTool === "eraser") {
      const stroke: FreehandStroke = {
        id: strokeId,
        userId: "local",
        tool: this.activeTool,
        style: { ...this.currentStyle },
        points: [worldPoint]
      };
      this.localStroke = stroke;

      // Immediate local live erase on pointerdown
      if (this.activeTool === "eraser") {
        this.erasePointOnCommitted(worldPoint, stroke.style.width);
      }

      if (this.callbacks.onStrokeStart) {
        this.callbacks.onStrokeStart(stroke);
      }
    } else if (
      this.activeTool === "line" ||
      this.activeTool === "rectangle" ||
      this.activeTool === "circle"
    ) {
      const stroke: ShapeStroke = {
        id: strokeId,
        userId: "local",
        tool: this.activeTool,
        style: { ...this.currentStyle },
        startPoint: worldPoint,
        endPoint: worldPoint
      };
      this.localStroke = stroke;
      if (this.callbacks.onStrokeStart) {
        this.callbacks.onStrokeStart(stroke);
      }
    }

    this.requestActiveRender();
  }

  private onPointerMove(e: PointerEvent): void {
    const screenPoint = this.getScreenPoint(e);
    const worldPoint = this.viewport.screenToWorld(screenPoint);
    this.lastScreenPoint = screenPoint;
    this.isPointerInside = true;
    this.updateToolCursor();

    if (this.callbacks.onCursorMove) {
      this.callbacks.onCursorMove(worldPoint);
    }

    if (this.isPanning) {
      const dx = screenPoint.x - this.panStartScreen.x;
      const dy = screenPoint.y - this.panStartScreen.y;
      this.panStartScreen = screenPoint;
      this.viewport.panBy(dx, dy);
      this.redrawCommitted();
      this.requestActiveRender();
      if (this.callbacks.onViewportChange) {
        this.callbacks.onViewportChange(this.viewport);
      }
      return;
    }

    if (!this.isDrawing || !this.localStroke) return;

    if (this.localStroke.tool === "brush" || this.localStroke.tool === "eraser") {
      const freehand = this.localStroke as FreehandStroke;
      const prevPoint = freehand.points[freehand.points.length - 1];
      freehand.points.push(worldPoint);

      // Continuous live erase segment while mouse button is held
      if (this.localStroke.tool === "eraser" && prevPoint) {
        this.eraseSegmentOnCommitted(prevPoint, worldPoint, freehand.style.width);
      }

      if (this.callbacks.onStrokePoints) {
        this.callbacks.onStrokePoints(freehand.id, [worldPoint]);
      }
    } else {
      const shape = this.localStroke as ShapeStroke;
      shape.endPoint = worldPoint;
      if (this.callbacks.onStrokePoints) {
        this.callbacks.onStrokePoints(shape.id, [worldPoint]);
      }
    }

    this.requestActiveRender();
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.activeCanvas.hasPointerCapture(e.pointerId)) {
      this.activeCanvas.releasePointerCapture(e.pointerId);
    }

    if (this.isPanning) {
      this.isPanning = false;
      this.container.style.cursor = this.activeTool === "hand" ? "grab" : "default";
      this.updateToolCursor();
      return;
    }

    if (this.isDrawing && this.localStroke) {
      const finishedStroke = this.localStroke;
      this.localStroke = null;
      this.isDrawing = false;

      // Commit stroke locally
      this.commitStroke(finishedStroke);

      if (this.callbacks.onStrokeEnd) {
        this.callbacks.onStrokeEnd(finishedStroke);
      }
    }

    this.requestActiveRender();
    this.updateToolCursor();
  }

  private onPointerCancel(e: PointerEvent): void {
    if (this.activeCanvas.hasPointerCapture(e.pointerId)) {
      this.activeCanvas.releasePointerCapture(e.pointerId);
    }
    const wasDrawing = this.isDrawing;
    const wasEraser = this.localStroke?.tool === "eraser";
    this.isDrawing = false;
    this.isPanning = false;
    this.localStroke = null;

    if (wasDrawing && wasEraser) {
      // Revert committed canvas since uncommitted erase was cancelled
      this.redrawCommitted();
    }

    this.requestActiveRender();
    this.updateToolCursor();
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = this.activeCanvas.getBoundingClientRect();
    const screenAnchor: Point = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };

    if (e.ctrlKey || e.metaKey) {
      // Zoom
      const zoomFactor = Math.pow(0.995, e.deltaY);
      this.viewport.zoomAt(screenAnchor, zoomFactor);
    } else {
      // Pan
      this.viewport.panBy(-e.deltaX, -e.deltaY);
    }

    this.redrawCommitted();
    this.requestActiveRender();

    if (this.callbacks.onViewportChange) {
      this.callbacks.onViewportChange(this.viewport);
    }
  }

  public setTool(tool: ToolType): void {
    this.activeTool = tool;
    this.updateToolCursor();
  }

  public setColor(color: string): void {
    this.currentStyle.color = color;
    this.updateToolCursor();
  }

  public setStrokeWidth(width: number): void {
    this.currentStyle.width = width;
    this.updateToolCursor();
  }

  public setZoom(zoom: number): void {
    const rect = this.activeCanvas.getBoundingClientRect();
    const center: Point = {
      x: rect.width / 2,
      y: rect.height / 2
    };
    this.viewport.setZoom(zoom, center);
    this.redrawCommitted();
    this.requestActiveRender();
    this.updateToolCursor();
    if (this.callbacks.onViewportChange) {
      this.callbacks.onViewportChange(this.viewport);
    }
  }

  public resetViewport(): void {
    this.viewport.reset();
    this.redrawCommitted();
    this.requestActiveRender();
    this.updateToolCursor();
    if (this.callbacks.onViewportChange) {
      this.callbacks.onViewportChange(this.viewport);
    }
  }

  public commitStroke(stroke: DrawingStroke): void {
    this.committedStrokes.push(stroke);
    if (stroke.tool === "eraser") {
      // Re-render committed layer to ensure canonical smoothed bezier curve
      this.redrawCommitted();
    } else {
      this.viewport.applyTransform(this.committedCtx);
      renderStroke(this.committedCtx, stroke);
    }
  }

  public setCommittedStrokes(strokes: DrawingStroke[]): void {
    this.committedStrokes = [...strokes];
    this.redrawCommitted();
  }

  public redrawCommitted(): void {
    clearLayer(this.committedCanvas, this.committedCtx, this.viewport);
    for (const stroke of this.committedStrokes) {
      renderStroke(this.committedCtx, stroke);
    }
    // Re-apply live active local eraser if currently drawing with eraser
    if (this.isDrawing && this.localStroke && this.localStroke.tool === "eraser") {
      renderStroke(this.committedCtx, this.localStroke);
    }
    // Re-apply any remote active erasers
    for (const remoteStroke of this.remoteActiveStrokes.values()) {
      if (remoteStroke.tool === "eraser") {
        renderStroke(this.committedCtx, remoteStroke);
      }
    }
  }

  public updateRemoteActiveStroke(stroke: DrawingStroke): void {
    this.remoteActiveStrokes.set(stroke.id, stroke);
    this.requestActiveRender();
  }

  public getRemoteActiveStroke(strokeId: string): DrawingStroke | undefined {
    return this.remoteActiveStrokes.get(strokeId);
  }

  public removeRemoteActiveStroke(strokeId: string): void {
    this.remoteActiveStrokes.delete(strokeId);
    this.requestActiveRender();
  }

  public clearCanvas(): void {
    this.committedStrokes = [];
    this.remoteActiveStrokes.clear();
    this.localStroke = null;
    clearLayer(this.committedCanvas, this.committedCtx, this.viewport);
    clearLayer(this.activeCanvas, this.activeCtx, this.viewport);
  }

  public requestActiveRender(): void {
    if (this.activeRenderPending) return;
    this.activeRenderPending = true;

    requestAnimationFrame(() => {
      this.activeRenderPending = false;
      this.renderActiveLayer();
    });
  }

  private renderActiveLayer(): void {
    const t0 = PerformanceProfiler.startMeasure();
    clearLayer(this.activeCanvas, this.activeCtx, this.viewport);

    // Render remote in-flight strokes (non-eraser strokes go on active layer)
    for (const remoteStroke of this.remoteActiveStrokes.values()) {
      if (remoteStroke.tool !== "eraser") {
        renderStroke(this.activeCtx, remoteStroke);
      }
    }

    // Render local in-flight stroke (non-eraser strokes go on active layer)
    if (this.localStroke && this.localStroke.tool !== "eraser") {
      renderStroke(this.activeCtx, this.localStroke);
    }
    PerformanceProfiler.endMeasure(t0, "active-canvas");
  }

  public getCommittedStrokes(): DrawingStroke[] {
    return this.committedStrokes;
  }
}
