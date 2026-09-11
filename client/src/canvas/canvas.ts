import { ToolType, StrokeStyle, DrawingStroke, FreehandStroke, ShapeStroke, Point } from "../types";
import { Viewport } from "./viewport";
import { renderStroke, clearLayer } from "./renderer";

export interface CanvasCallbacks {
  onStrokeStart?: (stroke: DrawingStroke) => void;
  onStrokePoints?: (strokeId: string, points: Point[]) => void;
  onStrokeEnd?: (stroke: DrawingStroke) => void;
  onCursorMove?: (worldPoint: Point) => void;
  onViewportChange?: (viewport: Viewport) => void;
}

export class CanvasEngine {
  public container: HTMLElement;
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

  constructor(container: HTMLElement, callbacks: CanvasCallbacks = {}) {
    this.container = container;
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

    this.setupResizeObserver();
    this.bindEvents();
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
  }

  private bindEvents(): void {
    // Pointer Events on active canvas
    this.activeCanvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    this.activeCanvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
    this.activeCanvas.addEventListener("pointerup", (e) => this.onPointerUp(e));
    this.activeCanvas.addEventListener("pointercancel", (e) => this.onPointerCancel(e));

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

  private onPointerDown(e: PointerEvent): void {
    // Only handle primary button or middle button (for panning)
    if (e.button !== 0 && e.button !== 1) return;

    this.activeCanvas.setPointerCapture(e.pointerId);
    const screenPoint = this.getScreenPoint(e);
    const worldPoint = this.viewport.screenToWorld(screenPoint);

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
      freehand.points.push(worldPoint);
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
  }

  private onPointerCancel(e: PointerEvent): void {
    if (this.activeCanvas.hasPointerCapture(e.pointerId)) {
      this.activeCanvas.releasePointerCapture(e.pointerId);
    }
    this.isDrawing = false;
    this.isPanning = false;
    this.localStroke = null;
    this.requestActiveRender();
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
    this.container.style.cursor = tool === "hand" ? "grab" : "crosshair";
  }

  public setColor(color: string): void {
    this.currentStyle.color = color;
  }

  public setStrokeWidth(width: number): void {
    this.currentStyle.width = width;
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
    if (this.callbacks.onViewportChange) {
      this.callbacks.onViewportChange(this.viewport);
    }
  }

  public resetViewport(): void {
    this.viewport.reset();
    this.redrawCommitted();
    this.requestActiveRender();
    if (this.callbacks.onViewportChange) {
      this.callbacks.onViewportChange(this.viewport);
    }
  }

  public commitStroke(stroke: DrawingStroke): void {
    this.committedStrokes.push(stroke);
    // Render on Layer 1
    this.viewport.applyTransform(this.committedCtx);
    renderStroke(this.committedCtx, stroke);
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
  }

  public updateRemoteActiveStroke(stroke: DrawingStroke): void {
    this.remoteActiveStrokes.set(stroke.id, stroke);
    this.requestActiveRender();
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
    clearLayer(this.activeCanvas, this.activeCtx, this.viewport);

    // Render remote in-flight strokes
    for (const remoteStroke of this.remoteActiveStrokes.values()) {
      renderStroke(this.activeCtx, remoteStroke);
    }

    // Render local in-flight stroke
    if (this.localStroke) {
      renderStroke(this.activeCtx, this.localStroke);
    }
  }

  public getCommittedStrokes(): DrawingStroke[] {
    return this.committedStrokes;
  }
}
