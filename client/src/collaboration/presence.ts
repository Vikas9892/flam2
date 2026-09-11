import { Viewport } from "../canvas/viewport";

interface CursorData {
  userId: string;
  userName: string;
  color: string;
  worldX: number;
  worldY: number;
  lastActive: number;
  element: HTMLElement;
}

export class PresenceManager {
  private container: HTMLElement;
  private cursors: Map<string, CursorData> = new Map();
  private cleanupInterval: number | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.startCleanupLoop();
  }

  public updateCursor(
    userId: string,
    userName: string,
    color: string,
    worldX: number,
    worldY: number,
    viewport: Viewport
  ): void {
    let data = this.cursors.get(userId);

    if (!data) {
      const el = document.createElement("div");
      el.className = "remote-cursor";
      el.innerHTML = `
        <svg class="cursor-pointer-svg" width="20" height="20" viewBox="0 0 24 24" fill="${color}" stroke="#ffffff" stroke-width="1.5">
          <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.85a.5.5 0 0 0-.85.35Z"/>
        </svg>
        <span class="cursor-tag" style="background-color: ${color};">${userName}</span>
      `;
      this.container.appendChild(el);

      data = {
        userId,
        userName,
        color,
        worldX,
        worldY,
        lastActive: Date.now(),
        element: el
      };
      this.cursors.set(userId, data);
    } else {
      data.worldX = worldX;
      data.worldY = worldY;
      data.lastActive = Date.now();
      if (data.userName !== userName) {
        data.userName = userName;
        const tag = data.element.querySelector(".cursor-tag");
        if (tag) tag.textContent = userName;
      }
    }

    this.positionCursor(data, viewport);
  }

  public positionAll(viewport: Viewport): void {
    for (const data of this.cursors.values()) {
      this.positionCursor(data, viewport);
    }
  }

  private positionCursor(data: CursorData, viewport: Viewport): void {
    const screen = viewport.worldToScreen({ x: data.worldX, y: data.worldY });
    data.element.style.transform = `translate3d(${screen.x}px, ${screen.y}px, 0)`;
  }

  public removeCursor(userId: string): void {
    const data = this.cursors.get(userId);
    if (data) {
      data.element.remove();
      this.cursors.delete(userId);
    }
  }

  public clear(): void {
    for (const data of this.cursors.values()) {
      data.element.remove();
    }
    this.cursors.clear();
  }

  private startCleanupLoop(): void {
    this.cleanupInterval = window.setInterval(() => {
      const now = Date.now();
      for (const [userId, data] of this.cursors.entries()) {
        if (now - data.lastActive > 5000) {
          data.element.remove();
          this.cursors.delete(userId);
        }
      }
    }, 2000);
  }

  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}
