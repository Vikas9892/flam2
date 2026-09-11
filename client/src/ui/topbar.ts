import { showToast } from "./toast";

export interface ParticipantInfo {
  userId: string;
  name: string;
  color: string;
  isSelf?: boolean;
}

export class TopBar {
  private el: HTMLElement;
  private statusIndicator: HTMLElement;
  private statusText: HTMLElement;
  private latencyEl: HTMLElement;
  private participantsCountEl: HTMLElement;
  private avatarStack: HTMLElement;
  private participantsPanel: HTMLElement;
  private participantsList: HTMLElement;
  private roomNameInput: HTMLInputElement;
  private roomIdTag: HTMLElement;

  private onRoomNameChange?: (name: string) => void;

  constructor(
    container: HTMLElement,
    roomId: string,
    initialRoomName: string = "Design Sprint",
    onRoomNameChange?: (name: string) => void
  ) {
    this.onRoomNameChange = onRoomNameChange;

    this.el = document.createElement("header");
    this.el.className = "top-bar";
    this.el.innerHTML = `
      <div class="top-bar-left">
        <div class="logo-badge">
          <div class="logo-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 19l7-7 3 3-7 7-3-3z"></path>
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path>
              <path d="M2 2l7.586 7.586"></path>
              <circle cx="11" cy="11" r="2"></circle>
            </svg>
          </div>
          <span>CanvasFlow</span>
        </div>
        <div class="room-badge-container">
          <span class="room-label">Room:</span>
          <input type="text" class="room-name-input" id="room-name-input" value="${initialRoomName}" title="Edit room name" />
          <span class="room-id-tag" id="room-id-tag">#${roomId}</span>
        </div>
      </div>

      <div class="top-bar-right">
        <div class="status-indicator connecting" id="status-indicator" title="Connection status">
          <div class="status-dot"></div>
          <span id="status-text">Connecting...</span>
        </div>

        <span class="latency-badge" id="latency-badge">-- ms</span>

        <div class="participants-summary" id="participants-toggle" title="View active participants">
          <div class="collaborator-avatar-stack" id="avatar-stack"></div>
          <span id="participants-count">👥 1</span>
        </div>

        <button class="btn-share" id="btn-share" title="Copy shareable link">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
            <polyline points="16 6 12 2 8 6"></polyline>
            <line x1="12" y1="2" x2="12" y2="15"></line>
          </svg>
          <span>Share</span>
        </button>
      </div>
    `;

    // Create Participants Dropdown Panel
    this.participantsPanel = document.createElement("div");
    this.participantsPanel.className = "participants-panel";
    this.participantsPanel.innerHTML = `
      <div style="font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px;">ACTIVE COLLABORATORS</div>
      <div id="participants-list" style="display: flex; flex-direction: column; gap: 6px;"></div>
    `;

    container.appendChild(this.el);
    document.body.appendChild(this.participantsPanel);

    this.statusIndicator = this.el.querySelector("#status-indicator")!;
    this.statusText = this.el.querySelector("#status-text")!;
    this.latencyEl = this.el.querySelector("#latency-badge")!;
    this.participantsCountEl = this.el.querySelector("#participants-count")!;
    this.avatarStack = this.el.querySelector("#avatar-stack")!;
    this.participantsList = this.participantsPanel.querySelector("#participants-list")!;
    this.roomNameInput = this.el.querySelector("#room-name-input")!;
    this.roomIdTag = this.el.querySelector("#room-id-tag")!;

    this.bindEvents();
  }

  private bindEvents(): void {
    // Share button
    this.el.querySelector("#btn-share")?.addEventListener("click", () => {
      navigator.clipboard.writeText(window.location.href).then(() => {
        showToast("Room link copied to clipboard!");
      }).catch(() => {
        showToast("Room link: " + window.location.href);
      });
    });

    // Participants toggle
    this.el.querySelector("#participants-toggle")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.participantsPanel.classList.toggle("visible");
    });

    // Close participants panel on outside click
    document.addEventListener("click", (e) => {
      if (!this.participantsPanel.contains(e.target as Node) && !this.el.querySelector("#participants-toggle")?.contains(e.target as Node)) {
        this.participantsPanel.classList.remove("visible");
      }
    });

    // Room name change
    this.roomNameInput.addEventListener("change", () => {
      const newName = this.roomNameInput.value.trim() || "Untitled";
      if (this.onRoomNameChange) {
        this.onRoomNameChange(newName);
      }
    });
  }

  public setConnectionStatus(status: "connected" | "reconnecting" | "offline" | "connecting"): void {
    this.statusIndicator.className = `status-indicator ${status}`;
    const labels = {
      connected: "Connected",
      reconnecting: "Reconnecting...",
      offline: "Offline",
      connecting: "Connecting..."
    };
    this.statusText.textContent = labels[status] || status;
  }

  public setLatency(ms: number): void {
    this.latencyEl.textContent = `${ms}ms`;
  }

  public setRoomId(id: string): void {
    this.roomIdTag.textContent = `#${id}`;
  }

  public updateParticipants(participants: ParticipantInfo[]): void {
    this.participantsCountEl.textContent = `👥 ${participants.length}`;

    // Update avatar stack (first 3)
    this.avatarStack.innerHTML = "";
    participants.slice(0, 3).forEach((p) => {
      const avatar = document.createElement("div");
      avatar.className = "avatar-circle";
      avatar.style.backgroundColor = p.color;
      avatar.textContent = p.name.charAt(0).toUpperCase();
      avatar.title = p.name + (p.isSelf ? " (You)" : "");
      this.avatarStack.appendChild(avatar);
    });

    // Update dropdown panel
    this.participantsList.innerHTML = "";
    participants.forEach((p) => {
      const item = document.createElement("div");
      item.className = "participant-item";
      item.innerHTML = `
        <div class="participant-dot" style="background-color: ${p.color};"></div>
        <span class="participant-name">${p.name}</span>
        ${p.isSelf ? '<span class="participant-you">You</span>' : ""}
      `;
      this.participantsList.appendChild(item);
    });
  }
}
