import { Point, ViewportTransform } from "../types";

export class Viewport {
  public panX: number = 0;
  public panY: number = 0;
  public zoom: number = 1.0;
  public dpr: number = window.devicePixelRatio || 1;

  public minZoom: number = 0.1;
  public maxZoom: number = 5.0;

  constructor() {
    this.updateDpr();
  }

  public updateDpr(): void {
    this.dpr = window.devicePixelRatio || 1;
  }

  public screenToWorld(screenPoint: Point): Point {
    return {
      x: (screenPoint.x - this.panX) / this.zoom,
      y: (screenPoint.y - this.panY) / this.zoom
    };
  }

  public worldToScreen(worldPoint: Point): Point {
    return {
      x: worldPoint.x * this.zoom + this.panX,
      y: worldPoint.y * this.zoom + this.panY
    };
  }

  public panBy(deltaX: number, deltaY: number): void {
    this.panX += deltaX;
    this.panY += deltaY;
  }

  public zoomAt(screenAnchor: Point, factor: number): void {
    const prevZoom = this.zoom;
    const newZoom = Math.min(Math.max(prevZoom * factor, this.minZoom), this.maxZoom);
    if (newZoom === prevZoom) return;

    // Keep point under cursor invariant:
    // (screen - pan) / prevZoom = (screen - newPan) / newZoom
    // newPan = screen - ((screen - pan) / prevZoom) * newZoom
    this.panX = screenAnchor.x - ((screenAnchor.x - this.panX) / prevZoom) * newZoom;
    this.panY = screenAnchor.y - ((screenAnchor.y - this.panY) / prevZoom) * newZoom;
    this.zoom = newZoom;
  }

  public setZoom(zoom: number, centerScreen: Point): void {
    const factor = zoom / this.zoom;
    this.zoomAt(centerScreen, factor);
  }

  public reset(): void {
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1.0;
  }

  public applyTransform(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(
      this.dpr * this.zoom,
      0,
      0,
      this.dpr * this.zoom,
      this.dpr * this.panX,
      this.dpr * this.panY
    );
  }

  public getTransform(): ViewportTransform {
    return {
      panX: this.panX,
      panY: this.panY,
      zoom: this.zoom
    };
  }
}
