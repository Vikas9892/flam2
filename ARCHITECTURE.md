# CanvasFlow System Architecture

This document provides a technical specification of the **CanvasFlow** architecture, network protocol, rendering pipeline, coordinate mathematics, state synchronization, and operational resilience.

---

## 1. System Overview & Context

CanvasFlow is a multi-user, real-time collaborative drawing whiteboard built with Vanilla TypeScript, the HTML5 Canvas 2D API, and Node.js + Socket.IO.

The core architectural mission is:
1. **Low-Latency Vector Synchronization**: Never stream raster pixels; stream lightweight vector operations.
2. **Server-Authoritative Ordering**: The server serializes drawing and history operations using monotonically increasing revisions.
3. **Deterministic State Derivation**: Clients derive active canvas state deterministically from an append-only operation log.
4. **Resilient Network Layer**: Robust connection lifecycle management with delta and snapshot recovery.

---

## 2. High-Level Data-Flow Diagram

```
                 User Input (Pointer Events)
                             │
                             ▼
                    Viewport Transform
               (Screen Coord -> World Space)
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
       Local Prediction             Batch Buffer (~30ms)
    (Immediate Render to L2)                │
                                            ▼
                                        Socket.IO
                                            │
                                            ▼
                                      Node.js Server
                                            │
                                   Validate & Assign Rev
                                            │
                                            ▼
                                  Append to History Log
                                            │
                                            ▼
                                     Room Broadcast
                                            │
                             ┌──────────────┴──────────────┐
                             ▼                             ▼
                        Peer Client A                 Peer Client B
                             │                             │
                      Apply Revision                Apply Revision
                             │                             │
                       Render to L1                  Render to L1
```

---

## 3. Canvas Layering Architecture

Rather than repainting every stroke whenever a user draws or pans, CanvasFlow implements a **4-layer decoupled rendering architecture**:

```
Layer 0: CSS Background
         Radial gradient dot matrix pattern. Zero canvas repaint overhead.
         ───────────────────────────────────────────────────────────────────
Layer 1: Committed Drawing Canvas (canvas-committed)
         Renders all canonical operations committed to the room history.
         Only repainted when viewport transforms change or operations are committed/undone.
         ───────────────────────────────────────────────────────────────────
Layer 2: Active Stroke Canvas (canvas-active)
         Renders in-flight local strokes (local prediction) and peer in-flight strokes.
         Cleared and redrawn on animation frames (rAF) without disturbing Layer 1.
         ───────────────────────────────────────────────────────────────────
Layer 3: DOM Presence Layer (#presence-layer)
         Renders remote collaborator cursors, participant name tags, and selection boxes.
         Positioned via hardware-accelerated CSS translate3d().
```

---

## 4. World Coordinates & Viewport Transform Mathematics

To ensure strokes remain aligned across diverse screen resolutions, window sizes, and arbitrary pan/zoom states, **all stored coordinates, stroke points, and peer cursor positions are represented in World Space**.

### Coordinate Conversions

Given:
- Screen pointer position $(S_x, S_y)$ relative to canvas bounding client rect
- Viewport pan offsets $(P_x, P_y)$
- Viewport zoom scale $Z$ ($0.1 \le Z \le 5.0$)

**Screen to World Transformation:**
$$W_x = \frac{S_x - P_x}{Z}, \quad W_y = \frac{S_y - P_y}{Z}$$

**World to Screen Transformation:**
$$S_x = W_x \cdot Z + P_x, \quad S_y = W_y \cdot Z + P_y$$

### High-DPI DPR Calibration

To preserve crisp vector lines on Retina displays:
$$\text{canvas.width} = \text{rect.width} \times \text{DPR}$$
$$\text{canvas.height} = \text{rect.height} \times \text{DPR}$$

The 2D context affine matrix is set globally per frame:
```ts
ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * panX, dpr * panY);
```
All subsequent drawing commands (`moveTo`, `lineTo`, `strokeRect`, `arc`) execute directly in world coordinates.

---

## 5. WebSocket Protocol Specification

All communication between clients and the Node.js server occurs over Socket.IO event channels.

### Message Contracts

| Event | Direction | Payload | Description |
|---|---|---|---|
| `room:join` | Client $\to$ Server | `{ roomId, user: { name } }` | Join or create an isolated room. |
| `room:state` | Server $\to$ Client | `{ roomId, self, participants, revision, operations }` | Initial room snapshot with state. |
| `room:resume` | Client $\to$ Server | `{ roomId, lastAppliedRevision, user }` | Reconnection request with last seen revision. |
| `room:delta` | Server $\to$ Client | `{ fromRevision, toRevision, operations }` | Delta operations since last applied revision. |
| `room:snapshot`| Server $\to$ Client | `{ revision, operations }` | Full room snapshot when delta exceeds 100 ops. |
| `stroke:start` | Client $\rightleftharpoons$ Server | `{ strokeId, tool, color, width, point }` | In-flight stroke initiation. |
| `stroke:points`| Client $\rightleftharpoons$ Server | `{ strokeId, points: [x, y][] }` | Batched point streaming for active stroke. |
| `stroke:end` | Client $\rightleftharpoons$ Server | `{ strokeId }` | In-flight stroke completion signal. |
| `operation:commit-stroke` | Client $\to$ Server | `{ operationId, stroke }` | Finalized stroke submission for canonical logging. |
| `operation:commit` | Server $\to$ Client | `{ operation }` | Server-serialized committed operation broadcast. |
| `history:undo` | Client $\to$ Server | `{}` | Global undo request. |
| `history:redo` | Client $\to$ Server | `{}` | Global redo request. |
| `presence:cursor` | Client $\rightleftharpoons$ Server | `{ worldX, worldY }` / `{ userId, userName, color, worldX, worldY }` | Live collaborator cursor updates (~25 Hz). |
| `presence:user-joined` | Server $\to$ Client | `{ user }` | Notification of newly joined peer. |
| `presence:user-left` | Server $\to$ Client | `{ userId }` | Notification of disconnected peer. |
| `connection:ping` / `connection:pong` | Client $\rightleftharpoons$ Server | `{ clientTime, serverTime }` | Heartbeat and latency round-trip tracking. |

---

## 6. Server-Authoritative Operation Model & Append-Only Log

Every committed mutation is an **immutable operation**:
```ts
interface Operation {
  id: string;        // Client-generated UUID (operationId)
  revision: number;  // Server-assigned monotonically increasing integer
  authorId: string;  // Socket ID of author
  type: "stroke" | "undo" | "redo";
  payload: DrawingStroke | { targetOperationId: string };
  timestamp: number; // Server timestamp (epoch ms)
}
```

### In-Flight Streaming vs Committed Operations

- **In-flight events** (`stroke:start`, `stroke:points`, `stroke:end`) are transient streaming events rendered only on Layer 2 (Active Canvas).
- If a client disconnects mid-stroke, the in-flight stroke is discarded. It **never** enters the canonical operation log.
- On `pointerup`, the client submits `operation:commit-stroke`. The server validates the stroke, increments `room.revision++`, appends it to `room.history`, and broadcasts `operation:commit`.

---

## 7. Synchronized Global Undo / Redo Algorithm

### Data Structures
The server `RoomHistory` tracks:
- `operations: Operation[]` (canonical ordered list)
- `undoneOperationIds: Set<string>` (set of operation IDs currently undone)
- `redoCandidates: string[]` (LIFO stack of undone operation IDs eligible for redo)

### Rules & State Machine
1. **Undo**:
   - The server traverses `operations` backwards to find the most recent operation that is:
     1. Type `"stroke"`
     2. Not currently in `undoneOperationIds`
   - If found (`op_target`), server assigns `revision++` and commits an append-only operation:
     $$\text{UndoOp} = \{ \text{type: "undo"}, \text{targetOperationId: op\_target.id} \}$$
   - `op_target.id` is added to `undoneOperationIds` and pushed to `redoCandidates`.
2. **Redo**:
   - If `redoCandidates.length > 0`, the server pops the most recent candidate (`targetId`).
   - Server assigns `revision++` and commits:
     $$\text{RedoOp} = \{ \text{type: "redo"}, \text{targetOperationId: targetId} \}$$
   - `targetId` is removed from `undoneOperationIds`.
3. **New Drawing Commits**:
   - Whenever a new `"stroke"` operation is committed, `redoCandidates = []` is cleared immediately.
4. **Deterministic State Derivation**:
   Both client and server derive visible strokes using a pure function:
   $$\text{VisibleStrokes} = \{ \text{op.payload} \mid \text{op.type} = \text{"stroke"} \land \text{op.id} \notin \text{undoneOperationIds} \}$$

---

## 8. Concurrency & Conflict Resolution

If two users click Undo simultaneously or draw concurrently:
- Requests arrive at the Node.js event loop sequentially.
- Request 1 is processed, assigned revision $N$, and targets the current active operation.
- Request 2 is processed next, assigned revision $N+1$, and targets the next active operation in line.
- Every connected client applies revisions strictly in numerical order, guaranteeing mathematical state convergence.

---

## 9. Reconnection & State Recovery

```
User Disconnected -> Reconnects
       │
       ▼
Emit room:resume { roomId, lastAppliedRevision: 140 }
       │
       ▼
Server checks: Δ = currentRevision (170) - lastApplied (140) = 30 ops
       │
       ├─ If Δ <= 100: Server emits room:delta { operations[141..170] }
       │               Client applies 30 operations incrementally.
       │
       └─ If Δ > 100:  Server emits room:snapshot { operations[1..170] }
                       Client replaces local history with full snapshot.
```

---

## 10. Performance Optimization Strategy

1. **Local Prediction**: Local drawing renders to Layer 2 synchronously on pointer events for 0ms perceptible drawing lag.
2. **Batched Network Updates**: Points are buffered locally and flushed at ~30ms cadence (~33 updates/sec) rather than flooding the socket on every raw input event.
3. **Throttled Presence**: Ephemeral cursor updates are capped at ~25 Hz per socket, bypassing the drawing history log.
4. **Selective Layer Repainting**: Drawing on Layer 2 does not repaint completed strokes on Layer 1.
5. **No Blind Web Workers / OffscreenCanvas**: Because multi-layer 2D canvas rendering easily maintains 60 FPS under normal workloads without thread-synchronization overhead, OffscreenCanvas was intentionally omitted to avoid unnecessary complexity.

---

## 11. Security, Input Validation & Rate Limiting

The server rejects malformed or malicious messages:
- **Room IDs**: Non-empty string $\le 64$ characters.
- **Stroke Width**: Finite number $1 \le w \le 100$.
- **Colors**: Validated against strict 6-digit hex regex `^#[0-9a-fA-F]{6}$`.
- **Coordinates**: Finite numbers strictly bound by $|x|, |y| < 10^7$ (rejecting `NaN` and `Infinity`).
- **Batched Points**: Max 200 points per batch; max 10,000 points per stroke.
- **Cursor Rate Limiting**: Throttled to at most once per 35ms per socket.

---

## 12. Production Deployment & Horizontal Scaling

### Single-Instance (Current Prototype & Baseline Deployment)
For 1–50 concurrent users:
- Single Node.js + Express process serving static Vite bundle and hosting the Socket.IO gateway.
- In-memory `Map<string, Room>` with empty-room lifecycle cleanup (10-minute idle timeout).
- Health check at `GET /health` returning `{"status": "ok"}`.

### Multi-Instance Scaling Roadmap (50–1000+ Concurrent Users)

To scale horizontally across multiple application servers:

```
                    Layer 7 Load Balancer
                 (Round-robin with Sticky Sessions)
                              │
             ┌────────────────┼────────────────┐
             ▼                ▼                ▼
         Node Server 1    Node Server 2    Node Server 3
             │                │                │
             └────────────────┼────────────────┘
                              │
                     Redis Pub/Sub Adapter
                     (@socket.io/redis-adapter)
                              │
                              ▼
                     Durable Storage
              (PostgreSQL / Redis Operation Store)
```

1. **Sticky Sessions**: WebSockets requiring HTTP long-polling handshake fallback must route subsequent handshakes to the same instance using session cookies.
2. **Redis Pub/Sub Adapter**: Emits room broadcasts across distributed Node server instances.
3. **Room Sharding**: Rooms can be mapped to specific worker nodes or database partitions using consistent hashing on `roomId`.
4. **Periodic Snapshotting**: Storing compressed snapshots every 500 revisions to optimize catch-up times for large histories.
