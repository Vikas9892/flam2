export class PerformanceHUD {
  private panel: HTMLElement;
  private fpsEl: HTMLElement;
  private latencyEl: HTMLElement;
  private usersEl: HTMLElement;
  private opsEl: HTMLElement;
  private msgRateEl: HTMLElement;

  private isVisible: boolean = false;
  private frameCount: number = 0;
  private lastFpsTime: number = performance.now();
  private currentFps: number = 60;
  private currentLatency: number = 0;
  private currentUsers: number = 1;
  private currentOps: number = 0;
  private messagesCount: number = 0;
  private currentMsgRate: number = 0;
  private lastMsgTime: number = performance.now();

  constructor() {
    this.panel = document.createElement("div");
    this.panel.className = "performance-hud";
    this.panel.innerHTML = `
      <div class="hud-title">
        <span>⌁ PERFORMANCE HUD</span>
        <span style="cursor: pointer;" id="hud-close">✕</span>
      </div>
      <div class="hud-row"><span>FPS</span><span class="hud-value" id="hud-fps">60</span></div>
      <div class="hud-row"><span>Latency</span><span class="hud-value" id="hud-latency">-- ms</span></div>
      <div class="hud-row"><span>Online Users</span><span class="hud-value" id="hud-users">1</span></div>
      <div class="hud-row"><span>Committed Ops</span><span class="hud-value" id="hud-ops">0</span></div>
      <div class="hud-row"><span>Network Msg/s</span><span class="hud-value" id="hud-msgrate">0</span></div>
    `;

    document.body.appendChild(this.panel);

    this.fpsEl = this.panel.querySelector("#hud-fps")!;
    this.latencyEl = this.panel.querySelector("#hud-latency")!;
    this.usersEl = this.panel.querySelector("#hud-users")!;
    this.opsEl = this.panel.querySelector("#hud-ops")!;
    this.msgRateEl = this.panel.querySelector("#hud-msgrate")!;

    this.panel.querySelector("#hud-close")?.addEventListener("click", () => {
      this.toggle();
    });

    this.startLoop();
  }

  public toggle(): void {
    this.isVisible = !this.isVisible;
    if (this.isVisible) {
      this.panel.classList.add("visible");
    } else {
      this.panel.classList.remove("visible");
    }
  }

  public setLatency(ms: number): void {
    this.currentLatency = ms;
    this.latencyEl.textContent = `${ms} ms`;
  }

  public setUsersCount(count: number): void {
    this.currentUsers = count;
    this.usersEl.textContent = `${count}`;
  }

  public setOpsCount(count: number): void {
    this.currentOps = count;
    this.opsEl.textContent = `${count}`;
  }

  public recordMessage(): void {
    this.messagesCount++;
  }

  private startLoop(): void {
    const loop = (now: number) => {
      this.frameCount++;
      const elapsed = now - this.lastFpsTime;

      if (elapsed >= 500) {
        this.currentFps = Math.round((this.frameCount * 1000) / elapsed);
        this.fpsEl.textContent = `${this.currentFps}`;
        this.frameCount = 0;
        this.lastFpsTime = now;
      }

      const msgElapsed = now - this.lastMsgTime;
      if (msgElapsed >= 1000) {
        this.currentMsgRate = Math.round((this.messagesCount * 1000) / msgElapsed);
        this.msgRateEl.textContent = `${this.currentMsgRate}`;
        this.messagesCount = 0;
        this.lastMsgTime = now;
      }

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }
}
