/**
 * Lightweight performance telemetry for CanvasFlow rendering and network batching.
 * Profiles frame duration, stroke render latency, and network throughput without
 * introducing heavyweight dependencies or OffscreenCanvas workers unnecessarily.
 */
export class PerformanceProfiler {
  private static renderTimes: number[] = [];
  private static maxSamples: number = 60;

  public static startMeasure(): number {
    return performance.now();
  }

  public static endMeasure(startTime: number, label: string = "render"): number {
    const duration = performance.now() - startTime;
    this.renderTimes.push(duration);
    if (this.renderTimes.length > this.maxSamples) {
      this.renderTimes.shift();
    }

    if (duration > 16.7) {
      // Frame exceeded 60fps budget (16.7ms)
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[CanvasFlow Perf] ${label} frame exceeded budget: ${duration.toFixed(2)}ms`);
      }
    }
    return duration;
  }

  public static getAverageRenderTime(): number {
    if (this.renderTimes.length === 0) return 0;
    const sum = this.renderTimes.reduce((acc, t) => acc + t, 0);
    return Math.round((sum / this.renderTimes.length) * 100) / 100;
  }
}
