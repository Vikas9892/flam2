import { describe, it, expect, beforeEach } from "vitest";
import { RoomHistory } from "../server/history";
import { Operation, DrawingStroke } from "../server/protocol";

function makeStrokeOp(id: string, revision: number, authorId: string): Operation {
  const stroke: DrawingStroke = {
    id,
    userId: authorId,
    tool: "brush",
    style: { color: "#6366f1", width: 4 },
    points: [{ x: 10, y: 10 }, { x: 20, y: 20 }]
  };

  return {
    id,
    revision,
    authorId,
    type: "stroke",
    payload: stroke,
    timestamp: Date.now()
  };
}

describe("RoomHistory - Synchronized Global Undo/Redo", () => {
  let history: RoomHistory;

  beforeEach(() => {
    history = new RoomHistory();
  });

  it("adds stroke operations and identifies latest active drawable", () => {
    const op1 = makeStrokeOp("op1", 1, "userA");
    history.addOperation(op1);

    expect(history.findLatestActiveDrawable()?.id).toBe("op1");
    expect(history.getActiveOperations().length).toBe(1);
  });

  it("handles multi-user undo correctly: B can undo A's latest stroke", () => {
    const opA1 = makeStrokeOp("A1", 1, "userA");
    const opB1 = makeStrokeOp("B1", 2, "userB");
    const opA2 = makeStrokeOp("A2", 3, "userA");

    history.addOperation(opA1);
    history.addOperation(opB1);
    history.addOperation(opA2);

    // B requests undo -> server finds latest active drawable: A2
    const target = history.findLatestActiveDrawable();
    expect(target?.id).toBe("A2");

    const undoA2: Operation = {
      id: "undo1",
      revision: 4,
      authorId: "userB",
      type: "undo",
      payload: { targetOperationId: "A2" },
      timestamp: Date.now()
    };
    history.addOperation(undoA2);

    // After undoing A2, active operations are A1 and B1
    const active = history.getActiveOperations().map((o) => o.id);
    expect(active).toEqual(["A1", "B1"]);

    // B requests undo again -> targets B1
    const target2 = history.findLatestActiveDrawable();
    expect(target2?.id).toBe("B1");

    const undoB1: Operation = {
      id: "undo2",
      revision: 5,
      authorId: "userB",
      type: "undo",
      payload: { targetOperationId: "B1" },
      timestamp: Date.now()
    };
    history.addOperation(undoB1);

    // Only A1 remains active
    expect(history.getActiveOperations().map((o) => o.id)).toEqual(["A1"]);
  });

  it("handles redo correctly and restores the latest undone operation", () => {
    const opA1 = makeStrokeOp("A1", 1, "userA");
    const opB1 = makeStrokeOp("B1", 2, "userB");
    history.addOperation(opA1);
    history.addOperation(opB1);

    // Undo B1
    const undoB1: Operation = {
      id: "undo1",
      revision: 3,
      authorId: "userA",
      type: "undo",
      payload: { targetOperationId: "B1" },
      timestamp: Date.now()
    };
    history.addOperation(undoB1);
    expect(history.getActiveOperations().map((o) => o.id)).toEqual(["A1"]);

    // Redo B1
    const redoTargetId = history.popRedoCandidate();
    expect(redoTargetId).toBe("B1");

    const redoB1: Operation = {
      id: "redo1",
      revision: 4,
      authorId: "userB",
      type: "redo",
      payload: { targetOperationId: redoTargetId! },
      timestamp: Date.now()
    };
    history.addOperation(redoB1);

    // B1 is restored
    expect(history.getActiveOperations().map((o) => o.id)).toEqual(["A1", "B1"]);
  });

  it("clears redo candidates when a new drawing operation is committed", () => {
    const opA1 = makeStrokeOp("A1", 1, "userA");
    history.addOperation(opA1);

    // Undo A1
    const undoA1: Operation = {
      id: "undo1",
      revision: 2,
      authorId: "userA",
      type: "undo",
      payload: { targetOperationId: "A1" },
      timestamp: Date.now()
    };
    history.addOperation(undoA1);
    expect(history.getRedoCandidates()).toEqual(["A1"]);

    // User C draws new stroke C1
    const opC1 = makeStrokeOp("C1", 3, "userC");
    history.addOperation(opC1);

    // Redo candidates must be wiped
    expect(history.getRedoCandidates()).toEqual([]);
    expect(history.popRedoCandidate()).toBeNull();
  });
});
