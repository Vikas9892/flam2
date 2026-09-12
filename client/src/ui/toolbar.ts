import { ToolType } from "../types";
import { CanvasEngine } from "../canvas/canvas";

export class Toolbar {
  private el: HTMLElement;
  private propertiesPanel: HTMLElement;
  private canvasEngine: CanvasEngine;
  private activeToolBtn: HTMLElement | null = null;

  private colorSwatches: string[] = [
    "#f3f4f6", "#9ca3af", "#ef4444", "#f97316", "#eab308",
    "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"
  ];

  private strokeWidths: number[] = [2, 4, 8, 12, 20];

  constructor(container: HTMLElement, canvasEngine: CanvasEngine) {
    this.canvasEngine = canvasEngine;

    // Create vertical toolbar
    this.el = document.createElement("div");
    this.el.className = "floating-toolbar";
    this.el.innerHTML = `
      <button class="tool-button" data-tool="hand" title="Hand (Pan) [H]" aria-label="Hand / Pan tool [H]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M6 14v-2a2 2 0 0 0-4 0v6a7 7 0 0 0 7 7h4a7 7 0 0 0 7-7v-6a2 2 0 0 0-4 0v3"/></svg>
        <span class="tooltip">Hand / Pan [H]</span>
      </button>

      <button class="tool-button active" data-tool="brush" title="Brush [B]" aria-label="Brush / Draw tool [B]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18.37 2.63 3 3L7.5 19.5 2 21l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
        <span class="tooltip">Brush [B]</span>
      </button>

      <button class="tool-button" data-tool="eraser" title="Eraser [E]" aria-label="Eraser tool [E]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4.93 19.07 4.24 4.24a1.5 1.5 0 0 0 2.12 0l10.6-10.6a1.5 1.5 0 0 0 0-2.12l-4.24-4.24a1.5 1.5 0 0 0-2.12 0L4.93 16.95a1.5 1.5 0 0 0 0 2.12z"/><path d="m14.83 9.17 4.24 4.24"/><line x1="2" y1="22" x2="22" y2="22"/></svg>
        <span class="tooltip">Eraser [E]</span>
      </button>

      <button class="tool-button" data-tool="line" title="Line [L]" aria-label="Line tool [L]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="19" x2="19" y2="5"/></svg>
        <span class="tooltip">Line [L]</span>
      </button>

      <button class="tool-button" data-tool="rectangle" title="Rectangle [R]" aria-label="Rectangle tool [R]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/></svg>
        <span class="tooltip">Rectangle [R]</span>
      </button>

      <button class="tool-button" data-tool="circle" title="Circle [C]" aria-label="Circle tool [C]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/></svg>
        <span class="tooltip">Circle [C]</span>
      </button>
    `;

    // Create Contextual Properties Panel
    this.propertiesPanel = document.createElement("div");
    this.propertiesPanel.className = "tool-properties-panel";
    this.buildPropertiesPanel();

    container.appendChild(this.el);
    container.appendChild(this.propertiesPanel);

    this.bindEvents();
    this.selectTool("brush");
  }

  private buildPropertiesPanel(): void {
    let swatchesHtml = "";
    this.colorSwatches.forEach((color) => {
      const activeClass = color === this.canvasEngine.currentStyle.color ? " active" : "";
      swatchesHtml += `<div class="color-swatch${activeClass}" data-color="${color}" style="background-color: ${color};"></div>`;
    });

    let widthsHtml = "";
    this.strokeWidths.forEach((w) => {
      const activeClass = w === this.canvasEngine.currentStyle.width ? " active" : "";
      widthsHtml += `<button class="width-preset-btn${activeClass}" data-width="${w}">${w}px</button>`;
    });

    this.propertiesPanel.innerHTML = `
      <div id="color-section">
        <div class="panel-section-title" style="margin-bottom: 8px;">Stroke Color</div>
        <div class="color-swatches-grid" id="color-grid">${swatchesHtml}</div>
        <div class="custom-color-row">
          <label for="custom-color-picker">Custom</label>
          <input type="color" id="custom-color-picker" class="custom-color-input" value="${this.canvasEngine.currentStyle.color}" />
        </div>
      </div>

      <div id="width-section">
        <div class="panel-section-title" id="width-section-title" style="margin-bottom: 8px;">Stroke Width</div>
        <div class="stroke-width-presets" id="width-presets">${widthsHtml}</div>
        <div class="stroke-width-slider-row" style="margin-top: 8px;">
          <input type="range" class="stroke-width-slider" id="stroke-slider" min="2" max="60" value="${this.canvasEngine.currentStyle.width}" />
          <span class="stroke-width-value" id="stroke-val">${this.canvasEngine.currentStyle.width}px</span>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    // Tool buttons
    this.el.querySelectorAll<HTMLButtonElement>(".tool-button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tool = btn.getAttribute("data-tool") as ToolType;
        if (tool) this.selectTool(tool);
      });
    });

    // Color Swatches
    this.propertiesPanel.querySelectorAll<HTMLElement>(".color-swatch").forEach((swatch) => {
      swatch.addEventListener("click", () => {
        const color = swatch.getAttribute("data-color");
        if (color) this.setColor(color);
      });
    });

    // Custom Color input
    const customColorInput = this.propertiesPanel.querySelector<HTMLInputElement>("#custom-color-picker");
    customColorInput?.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      this.setColor(target.value);
    });

    // Stroke Width presets
    this.propertiesPanel.querySelectorAll<HTMLButtonElement>(".width-preset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const width = parseInt(btn.getAttribute("data-width") || "4", 10);
        this.setWidth(width);
      });
    });

    // Stroke Width slider
    const slider = this.propertiesPanel.querySelector<HTMLInputElement>("#stroke-slider");
    slider?.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      this.setWidth(parseInt(target.value, 10));
    });
  }

  public selectTool(tool: ToolType): void {
    this.canvasEngine.setTool(tool);

    this.el.querySelectorAll(".tool-button").forEach((b) => b.classList.remove("active"));
    const btn = this.el.querySelector(`[data-tool="${tool}"]`);
    if (btn) btn.classList.add("active");

    const colorSection = this.propertiesPanel.querySelector<HTMLElement>("#color-section");
    const widthTitle = this.propertiesPanel.querySelector<HTMLElement>("#width-section-title");

    // Show/hide properties panel depending on tool
    if (tool === "hand") {
      this.propertiesPanel.style.display = "none";
    } else if (tool === "eraser") {
      this.propertiesPanel.style.display = "flex";
      if (colorSection) colorSection.style.display = "none";
      if (widthTitle) widthTitle.textContent = "Eraser Size";
    } else {
      this.propertiesPanel.style.display = "flex";
      if (colorSection) colorSection.style.display = "block";
      if (widthTitle) widthTitle.textContent = "Stroke Width";
    }
  }

  public setColor(color: string): void {
    this.canvasEngine.setColor(color);

    // Update active swatch
    this.propertiesPanel.querySelectorAll(".color-swatch").forEach((s) => {
      s.classList.toggle("active", s.getAttribute("data-color") === color);
    });

    const customPicker = this.propertiesPanel.querySelector<HTMLInputElement>("#custom-color-picker");
    if (customPicker) customPicker.value = color;
  }

  public setWidth(width: number): void {
    this.canvasEngine.setStrokeWidth(width);

    // Update preset buttons
    this.propertiesPanel.querySelectorAll(".width-preset-btn").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-width") === width.toString());
    });

    const slider = this.propertiesPanel.querySelector<HTMLInputElement>("#stroke-slider");
    if (slider) slider.value = width.toString();

    const valLabel = this.propertiesPanel.querySelector("#stroke-val");
    if (valLabel) valLabel.textContent = `${width}px`;
  }
}
