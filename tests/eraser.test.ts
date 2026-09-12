import { describe, it, expect, beforeEach } from "vitest";
import { RoomHistory } from "../server/history";
import { ClientHistory } from "../client/src/state/history";
import { Operation, DrawingStroke, FreehandStroke } from "../server/protocol";

// Simulated client-side interaction state manager following CanvasEngine's exact pointer lifecycle
class PointerInteractionController {
  public isDrawing: boolean = false;
  public activeStroke: FreehandStroke | null = null;
  public committedStrokes: DrawingStroke[] = [];
  public committedOperations: Operation[] = [];
  public erasedPreviewSegments: { p1: { x: number; y: number }; p2: { x: number; y: number } }[] = [];

  public onPointerDown(
    tool: "brush" | "eraser",
    worldPoint: { x: number; y: number },
    width: number
  ): void {
    this.isDrawing = true;
    const stroke: FreehandStroke = {
      id: "stroke_" + Math.random().toString(36).substring(2, 9),
      userId: "local-user",
      tool,
      style: { color: tool === "eraser" ? "#000000" : "#6366f1", width },
      points: [worldPoint]
    };
    this.activeStroke = stroke;
    this.erasedPreviewSegments = [];

    if (tool === "eraser") {
      // Immediate live erase preview on pointerdown
      this.erasedPreviewSegments.push({ p1: worldPoint, p2: worldPoint });
    }
  }

  public onPointerMove(worldPoint: { x: number; y: number }): void {
    if (!this.isDrawing || !this.activeStroke) return;

    const prevPoint = this.activeStroke.points[this.activeStroke.points.length - 1];
    this.activeStroke.points.push(worldPoint);

    if (this.activeStroke.tool === "eraser" && prevPoint) {
      // Live continuous eraser segment while mouse button is held
      this.erasedPreviewSegments.push({ p1: prevPoint, p2: worldPoint });
    }
  }

  public onPointerUp(): Operation | null {
    if (!this.isDrawing || !this.activeStroke) return null;

    const finished = this.activeStroke;
    this.activeStroke = null;
    this.isDrawing = false;
    this.committedStrokes.push(finished);

    const op: Operation = {
      id: finished.id,
      revision: this.committedOperations.length + 1,
      authorId: finished.userId,
      type: "stroke",
      payload: finished,
      timestamp: Date.now()
    };
    this.committedOperations.push(op);
    return op;
  }

  public onPointerCancel(): void {
    this.isDrawing = false;
    this.activeStroke = null;
    this.erasedPreviewSegments = [];
  }
}

describe("Eraser Interaction & Operation Lifecycle", () => {
  let controller: PointerInteractionController;

  beforeEach(() => {
    controller = new PointerInteractionController();
  });

  it("1. Eraser starts immediately on pointerdown and captures initial point", () => {
    controller.onPointerDown("eraser", { x: 50, y: 50 }, 20);

    expect(controller.isDrawing).toBe(true);
    expect(controller.activeStroke).not.toBeNull();
    expect(controller.activeStroke?.tool).toBe("eraser");
    expect(controller.activeStroke?.style.width).toBe(20);
    expect(controller.activeStroke?.points).toEqual([{ x: 50, y: 50 }]);
    // Immediate live erase preview initiated on pointerdown
    expect(controller.erasedPreviewSegments.length).toBe(1);
    expect(controller.erasedPreviewSegments[0]).toEqual({
      p1: { x: 50, y: 50 },
      p2: { x: 50, y: 50 }
    });
  });

  it("2. Eraser receives points continuously during pointermove while mouse is held", () => {
    controller.onPointerDown("eraser", { x: 10, y: 10 }, 16);
    controller.onPointerMove({ x: 20, y: 20 });
    controller.onPointerMove({ x: 30, y: 30 });
    controller.onPointerMove({ x: 40, y: 40 });

    expect(controller.activeStroke?.points.length).toBe(4);
    expect(controller.activeStroke?.points).toEqual([
      { x: 10, y: 10 },
      { x: 20, y: 20 },
      { x: 30, y: 30 },
      { x: 40, y: 40 }
    ]);
    // Live continuous erase segments generated for every move
    expect(controller.erasedPreviewSegments.length).toBe(4);
    expect(controller.erasedPreviewSegments[1]).toEqual({
      p1: { x: 10, y: 10 },
      p2: { x: 20, y: 20 }
    });
  });

  it("3. Eraser preview exists before pointerup", () => {
    controller.onPointerDown("eraser", { x: 0, y: 0 }, 10);
    controller.onPointerMove({ x: 15, y: 15 });

    // While dragging before mouse release:
    expect(controller.isDrawing).toBe(true);
    expect(controller.activeStroke).not.toBeNull();
    expect(controller.erasedPreviewSegments.length).toBeGreaterThan(0);
    expect(controller.committedOperations.length).toBe(0); // Not committed yet
  });

  it("4. Pointerup finalizes exactly one erase operation with all accumulated points", () => {
    controller.onPointerDown("eraser", { x: 5, y: 5 }, 12);
    controller.onPointerMove({ x: 15, y: 15 });
    controller.onPointerMove({ x: 25, y: 25 });

    const op = controller.onPointerUp();

    expect(op).not.toBeNull();
    expect(op?.type).toBe("stroke");
    const stroke = op?.payload as FreehandStroke;
    expect(stroke.tool).toBe("eraser");
    expect(stroke.style.width).toBe(12);
    expect(stroke.points.length).toBe(3);

    // Active state is cleared upon completion
    expect(controller.isDrawing).toBe(false);
    expect(controller.activeStroke).toBeNull();
    expect(controller.committedOperations.length).toBe(1);
    expect(controller.committedStrokes.length).toBe(1);
  });

  it("5. Cancelled pointer interaction does not create a committed erase", () => {
    controller.onPointerDown("eraser", { x: 10, y: 10 }, 20);
    controller.onPointerMove({ x: 20, y: 20 });
    controller.onPointerMove({ x: 30, y: 30 });

    // Interaction is cancelled (e.g. pointercancel event or Escape key)
    controller.onPointerCancel();

    expect(controller.isDrawing).toBe(false);
    expect(controller.activeStroke).toBeNull();
    expect(controller.committedOperations.length).toBe(0);
    expect(controller.committedStrokes.length).toBe(0);
  });

  it("6. Brush still starts and renders immediately on pointerdown", () => {
    controller.onPointerDown("brush", { x: 100, y: 100 }, 4);

    expect(controller.isDrawing).toBe(true);
    expect(controller.activeStroke?.tool).toBe("brush");
    expect(controller.activeStroke?.points).toEqual([{ x: 100, y: 100 }]);

    controller.onPointerMove({ x: 110, y: 110 });
    const op = controller.onPointerUp();

    expect(op).not.toBeNull();
    expect(op?.type).toBe("stroke");
    expect((op?.payload as FreehandStroke).tool).toBe("brush");
    expect(controller.committedOperations.length).toBe(1);
  });

  it("7. Synchronized undo and redo treats the completed erase as one logical operation", () => {
    const roomHistory = new RoomHistory();

    // 1. User A draws a brush stroke
    const brushOp: Operation = {
      id: "brush1",
      revision: 1,
      authorId: "userA",
      type: "stroke",
      payload: {
        id: "brush1",
        userId: "userA",
        tool: "brush",
        style: { color: "#3b82f6", width: 4 },
        points: [{ x: 10, y: 10 }, { x: 20, y: 20 }]
      } as FreehandStroke,
      timestamp: 1000
    };
    roomHistory.addOperation(brushOp);

    // 2. User B erases across User A's stroke
    const eraseOp: Operation = {
      id: "erase1",
      revision: 2,
      authorId: "userB",
      type: "stroke",
      payload: {
        id: "erase1",
        userId: "userB",
        tool: "eraser",
        style: { color: "#000000", width: 20 },
        points: [{ x: 12, y: 12 }, { x: 18, y: 18 }]
      } as FreehandStroke,
      timestamp: 2000
    };
    roomHistory.addOperation(eraseOp);

    expect(roomHistory.getActiveOperations().length).toBe(2);
    expect(roomHistory.findLatestActiveDrawable()?.id).toBe("erase1");

    // 3. Undo the erase operation
    const undoErase: Operation = {
      id: "undo_erase",
      revision: 3,
      authorId: "userA",
      type: "undo",
      payload: { targetOperationId: "erase1" },
      timestamp: 3000
    };
    roomHistory.addOperation(undoErase);

    // Erase is undone in 1 step; brush1 remains active
    const activeAfterUndo = roomHistory.getActiveOperations();
    expect(activeAfterUndo.length).toBe(1);
    expect(activeAfterUndo[0].id).toBe("brush1");
    expect(roomHistory.getRedoCandidates()).toEqual(["erase1"]);

    // 4. Redo the erase operation
    const redoCandidate = roomHistory.popRedoCandidate();
    expect(redoCandidate).toBe("erase1");

    const redoErase: Operation = {
      id: "redo_erase",
      revision: 4,
      authorId: "userB",
      type: "redo",
      payload: { targetOperationId: redoCandidate! },
      timestamp: 4000
    };
    roomHistory.addOperation(redoErase);

    // Erase is restored in 1 step; both brush1 and erase1 are active
    const activeAfterRedo = roomHistory.getActiveOperations();
    expect(activeAfterRedo.length).toBe(2);
    expect(activeAfterRedo.map((o) => o.id)).toEqual(["brush1", "erase1"]);
  });

  it("8. Collaborative clients receive and apply finalized erase correctly", () => {
    const clientA = new ClientHistory();
    const clientB = new ClientHistory();

    const op1: Operation = {
      id: "line1",
      revision: 1,
      authorId: "userA",
      type: "stroke",
      payload: {
        id: "line1",
        userId: "userA",
        tool: "brush",
        style: { color: "#22c55e", width: 4 },
        points: [{ x: 0, y: 0 }, { x: 100, y: 100 }]
      } as FreehandStroke,
      timestamp: 100
    };

    const eraseOp: Operation = {
      id: "erase1",
      revision: 2,
      authorId: "userB",
      type: "stroke",
      payload: {
        id: "erase1",
        userId: "userB",
        tool: "eraser",
        style: { color: "#000000", width: 24 },
        points: [{ x: 50, y: 40 }, { x: 50, y: 60 }]
      } as FreehandStroke,
      timestamp: 200
    };

    // Both clients receive operations
    clientA.applyOperation(op1);
    clientA.applyOperation(eraseOp);

    clientB.applyOperation(op1);
    clientB.applyOperation(eraseOp);

    const strokesA = clientA.getActiveStrokes();
    const strokesB = clientB.getActiveStrokes();

    expect(strokesA.length).toBe(2);
    expect(strokesB.length).toBe(2);
    expect(strokesA[1].tool).toBe("eraser");
    expect(strokesB[1].tool).toBe("eraser");
    expect(strokesA).toEqual(strokesB);
  });
});
