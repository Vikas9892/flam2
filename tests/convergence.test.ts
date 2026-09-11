import { describe, it, expect } from "vitest";
import { ClientHistory } from "../client/src/state/history";
import { Operation, DrawingStroke } from "../server/protocol";

function createStroke(id: string, authorId: string): DrawingStroke {
  return {
    id,
    userId: authorId,
    tool: "brush",
    style: { color: "#ec4899", width: 6 },
    points: [{ x: 100, y: 150 }, { x: 110, y: 160 }]
  };
}

describe("State Convergence - Collaborative Clients", () => {
  it("converges Client A, B, and C to identical active state after interleaved draws, undos, and redos", () => {
    const clientA = new ClientHistory();
    const clientB = new ClientHistory();
    const clientC = new ClientHistory();

    const operations: Operation[] = [
      // 1. A draws A1
      {
        id: "A1",
        revision: 1,
        authorId: "userA",
        type: "stroke",
        payload: createStroke("A1", "userA"),
        timestamp: 1000
      },
      // 2. B draws B1
      {
        id: "B1",
        revision: 2,
        authorId: "userB",
        type: "stroke",
        payload: createStroke("B1", "userB"),
        timestamp: 1010
      },
      // 3. A draws A2
      {
        id: "A2",
        revision: 3,
        authorId: "userA",
        type: "stroke",
        payload: createStroke("A2", "userA"),
        timestamp: 1020
      },
      // 4. B undos A2
      {
        id: "undo1",
        revision: 4,
        authorId: "userB",
        type: "undo",
        payload: { targetOperationId: "A2" },
        timestamp: 1030
      },
      // 5. C draws C1
      {
        id: "C1",
        revision: 5,
        authorId: "userC",
        type: "stroke",
        payload: createStroke("C1", "userC"),
        timestamp: 1040
      },
      // 6. A undos C1
      {
        id: "undo2",
        revision: 6,
        authorId: "userA",
        type: "undo",
        payload: { targetOperationId: "C1" },
        timestamp: 1050
      },
      // 7. B redos C1
      {
        id: "redo1",
        revision: 7,
        authorId: "userB",
        type: "redo",
        payload: { targetOperationId: "C1" },
        timestamp: 1060
      }
    ];

    // Client A receives operations one by one sequentially
    for (const op of operations) {
      clientA.applyOperation(op);
    }

    // Client B receives operations in a burst
    clientB.setOperations(operations);

    // Client C receives operations in reversed network arrival order, but ordered by revision
    const shuffled = [...operations].reverse();
    for (const op of shuffled) {
      clientC.applyOperation(op);
    }

    const activeA = clientA.getActiveStrokes().map((s) => s.id);
    const activeB = clientB.getActiveStrokes().map((s) => s.id);
    const activeC = clientC.getActiveStrokes().map((s) => s.id);

    // All clients must derive the exact same active operations: [A1, B1, C1]
    expect(activeA).toEqual(["A1", "B1", "C1"]);
    expect(activeB).toEqual(["A1", "B1", "C1"]);
    expect(activeC).toEqual(["A1", "B1", "C1"]);

    expect(activeA).toEqual(activeB);
    expect(activeB).toEqual(activeC);
  });
});
