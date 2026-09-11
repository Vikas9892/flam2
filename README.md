# CanvasFlow

> **Draw together. In real time.**
> A lightweight Excalidraw-style collaborative whiteboard built from scratch with **Vanilla TypeScript**, **HTML5 Canvas**, **Node.js**, **Express**, and **Socket.IO**.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-black.svg)](https://socket.io/)
[![HTML5 Canvas](https://img.shields.io/badge/HTML5-Canvas-orange.svg)](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
[![Vitest](https://img.shields.io/badge/Tests-Vitest-green.svg)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Overview

CanvasFlow is an interactive real-time collaborative drawing canvas engineered without third-party canvas libraries (e.g. Fabric.js, Konva) or frontend frameworks (e.g. React, Vue). It demonstrates core systems engineering: an append-only server-authoritative operation history, synchronized global cross-user undo/redo, world-space coordinate transformations, multi-layer canvas rendering, throttled presence indicators, and state recovery upon reconnection.

---

## Features

- **Multi-User Real-Time Drawing**: Sub-millisecond local stroke prediction paired with batched point streaming to peer canvases.
- **Layered Canvas Architecture**:
  - *Layer 0 (CSS)*: Dotted matrix grid background with zero canvas repainting overhead.
  - *Layer 1 (Committed Canvas)*: Renders canonical operations from the history log.
  - *Layer 2 (Active Canvas)*: Immediate local stroke prediction and remote collaborator in-flight strokes.
  - *Layer 3 (Presence DOM Layer)*: Live collaborator cursor positions, name tags, and assigned avatars.
- **Synchronized Global Undo / Redo**:
  - Global room-level undo (User B can undo User A's latest stroke).
  - Append-only history model (`undo` and `redo` operations preserve the immutable log).
  - Committing any new drawing operation clears redo candidates deterministically.
- **World-Space Coordinate System**:
  - Continuous zoom ($0.1\times$ to $5.0\times$) and infinite panning.
  - World coordinates prevent stroke distortion or cursor desynchronization across varying screens or viewport offsets.
- **Live Presence & Cursors**:
  - Throttled real-time collaborator cursors (~25 Hz) with participant names and distinct palette colors.
  - Automatic participant lifecycle management and idle removal.
- **Resilience & Reconnection**:
  - Explicit connection state lifecycle (`Connected`, `Reconnecting...`, `Offline`).
  - Delta synchronization (`room:delta`) for short dropouts ($\le 100$ operations) and snapshot recovery (`room:snapshot`) for extended disconnects.
- **Drawing Tools & Geometry**:
  - Freehand Brush & Eraser (smooth quadratic bezier curve interpolation).
  - Primitives: Straight Line, Rectangle, Circle/Ellipse.
  - Hand / Pan tool.
  - 10-color curated palette + custom hex picker.
  - Preset stroke weights (2px, 4px, 8px, 12px, 20px) and slider.
- **High-DPI / Retina Display Support**: Auto-calibrated with `window.devicePixelRatio`.
- **PNG Canvas Export**: Bounding-box calculated export yielding sharp 2x resolution PNG files.
- **Keyboard Shortcuts**: Natural mapping (`B`, `E`, `L`, `R`, `C`, `H`, `Ctrl+Z`, `Ctrl+Y`, `+`, `-`, `0`).
- **Developer Performance HUD**: Built-in `⌁ Perf` toggle tracking real-time FPS, round-trip latency (ms), active users, total operations, and network messages/sec.

---

## Architecture Summary

```
                         CanvasFlow
                             │
             ┌───────────────┴──────────────┐
             │                              │
           Client                         Server
             │                              │
     ┌───────┼────────┐             ┌───────┼────────┐
     │       │        │             │       │        │
     UI    Canvas   Network        Rooms   History  Presence
             │        │             │       │
        ┌────┴────┐   │             │       │
     Renderer   Input │             │       │
        └────┬────┘   │             └───┬───┘
             │        │                 │
             └────────┼─────────────────┘
                      │
                  Socket.IO
                      │
               ordered events
                      │
                room broadcast
```

For complete technical specifications, mathematical transforms, message protocols, and horizontal scaling strategies, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Tech Stack

- **Frontend**: Vanilla TypeScript, HTML5 Canvas 2D API, Native Pointer Events, CSS3 Variables & Flexbox/Grid.
- **Build System**: Vite 6.
- **Backend**: Node.js, Express, Socket.IO 4.8.
- **Testing**: Vitest (deterministic convergence testing, history ordering, and protocol security fuzzing).
- **Deployment**: Unified single-service Node.js + static build bundle (`/health` check endpoint, configurable `PORT`, production-safe CORS).

---

## Running Locally

### Prerequisites
- Node.js (v18+ recommended, verified on v22.17.1)
- npm (v9+)

### Installation & Startup

```bash
# 1. Clone the repository
git clone https://github.com/Vikas9892/flam2.git
cd flam2

# 2. Install dependencies
npm install

# 3. Start development server
# Runs Express + Socket.IO on port 3001 and Vite client on port 5173 with proxy
npm run dev

# Or build and start unified production server:
npm run build
npm start
```

Visit `http://localhost:5173` (development) or `http://localhost:3001` (production).

---

## Testing Collaboration Locally

1. Open your browser and navigate to `http://localhost:5173` (or `http://localhost:3001`).
2. Notice the room ID in the top bar (default: `#design-sprint` or `?room=<id>`).
3. Click the **Share** button to copy the room URL.
4. Open a second browser window (or incognito tab) and paste the URL.
5. Notice:
   - Both users appear in the participants pill (`👥 2`) with assigned colors and names.
   - Moving your pointer in Tab A renders a smooth cursor with your tag in Tab B.
   - Drawing in Tab A streams points in real-time to Tab B.
   - Pressing **Undo** (`Ctrl+Z`) in Tab B undos Tab A's latest stroke globally across both screens.
   - Clicking `⌁ Perf` opens the live performance HUD showing FPS and ping latency.

---

## Running Automated Tests

The test suite validates undo/redo state transitions, multi-client convergence, and security input validation:

```bash
npm test
```

### Test Suites:
- `tests/history.test.ts`: Validates append-only history, latest active drawable lookup, cross-user undo, and clearing redo candidates upon new commits.
- `tests/convergence.test.ts`: Verifies that independent simulated clients (A, B, C) receiving operations in varying sequences converge to the exact same derived active canvas state.
- `tests/protocol.test.ts`: Security and validation fuzz testing (rejecting negative widths, non-hex colors, NaN coordinates, oversized point batches, and malformed room IDs).

---

## Key Design Decisions & Interview Highlights

1. **Why Operation-Based Synchronization instead of Pixel Streaming?**
   - We never transmit `canvas.toDataURL()` or raster images over WebSockets. Synchronizing discrete, compact vector operations (`{ id, tool, points, color, width }`) reduces network payload by >99% and enables infinite resolution, dynamic zooming, and deterministic global undo/redo.
2. **Why Socket.IO instead of Native WebSockets?**
   - Socket.IO provides battle-tested room isolation (`socket.join(room)`), automatic reconnection with exponential backoff, transport fallback (WebSocket $\to$ HTTP Long-Polling), and straightforward event-driven messaging without rolling custom framing code.
3. **Why an Ordered Operation Log instead of CRDTs?**
   - Collaborative drawing whiteboards do not suffer from character-level interleaving text conflicts. A server-authoritative monotonically increasing revision counter provides deterministic state convergence and linear undo/redo semantics without the massive CPU and memory footprint of a CRDT like Yjs.
4. **World-Space Coordinates vs Screen Coordinates**:
   - Screen coordinates are immediately converted into world coordinates via an affine viewport transformation matrix:
     $$\text{worldX} = \frac{\text{screenX} - \text{panX}}{\text{zoom}}, \quad \text{worldY} = \frac{\text{screenY} - \text{panY}}{\text{zoom}}$$
   - Viewport zooming, panning, and high-DPI scaling never mutate or distort saved drawings or peer cursors.

---

## License

This project is open source and available under the [MIT License](LICENSE).
