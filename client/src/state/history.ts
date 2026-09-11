import { Operation, DrawingStroke } from "../types";
import { deriveActiveStrokes } from "./drawing-state";

export class ClientHistory {
  private operations: Map<string, Operation> = new Map();
  public lastAppliedRevision: number = 0;
  private undoneIds: Set<string> = new Set();
  private redoCandidates: string[] = [];

  public applyOperation(op: Operation): void {
    this.operations.set(op.id, op);
    if (op.revision > this.lastAppliedRevision) {
      this.lastAppliedRevision = op.revision;
    }

    if (op.type === "stroke") {
      this.redoCandidates = [];
    } else if (op.type === "undo") {
      const targetId = (op.payload as { targetOperationId: string }).targetOperationId;
      this.undoneIds.add(targetId);
      this.redoCandidates.push(targetId);
    } else if (op.type === "redo") {
      const targetId = (op.payload as { targetOperationId: string }).targetOperationId;
      this.undoneIds.delete(targetId);
    }
  }

  public setOperations(ops: Operation[]): void {
    this.operations.clear();
    this.undoneIds.clear();
    this.redoCandidates = [];
    this.lastAppliedRevision = 0;

    // Sort by revision
    const sorted = [...ops].sort((a, b) => a.revision - b.revision);
    for (const op of sorted) {
      this.applyOperation(op);
    }
  }

  public getActiveStrokes(): DrawingStroke[] {
    return deriveActiveStrokes(Array.from(this.operations.values()));
  }

  public getOperation(id: string): Operation | undefined {
    return this.operations.get(id);
  }

  public getAllOperations(): Operation[] {
    return Array.from(this.operations.values());
  }

  public canUndo(): boolean {
    // True if there is at least one active stroke
    for (const op of this.operations.values()) {
      if (op.type === "stroke" && !this.undoneIds.has(op.id)) {
        return true;
      }
    }
    return false;
  }

  public canRedo(): boolean {
    return this.redoCandidates.length > 0;
  }
}
