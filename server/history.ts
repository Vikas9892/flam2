import { Operation } from "./protocol.js";

export class RoomHistory {
  private operations: Operation[] = [];
  private undoneOperationIds: Set<string> = new Set();
  private redoCandidates: string[] = [];

  public addOperation(op: Operation): void {
    this.operations.push(op);

    if (op.type === "stroke") {
      // New committed drawing operation clears redo candidates!
      this.redoCandidates = [];
    } else if (op.type === "undo") {
      const targetId = (op.payload as { targetOperationId: string }).targetOperationId;
      this.undoneOperationIds.add(targetId);
      this.redoCandidates.push(targetId);
    } else if (op.type === "redo") {
      const targetId = (op.payload as { targetOperationId: string }).targetOperationId;
      this.undoneOperationIds.delete(targetId);
    }
  }

  public getOperations(): Operation[] {
    return this.operations;
  }

  public getOperationsFrom(fromRevision: number): Operation[] {
    return this.operations.filter((op) => op.revision > fromRevision);
  }

  public getUndoneOperationIds(): Set<string> {
    return this.undoneOperationIds;
  }

  public getRedoCandidates(): string[] {
    return this.redoCandidates;
  }

  /**
   * Find the most recent committed operation that:
   * 1. is drawable ("stroke")
   * 2. is currently active (not in undoneOperationIds)
   */
  public findLatestActiveDrawable(): Operation | null {
    for (let i = this.operations.length - 1; i >= 0; i--) {
      const op = this.operations[i];
      if (op.type === "stroke" && !this.undoneOperationIds.has(op.id)) {
        return op;
      }
    }
    return null;
  }

  /**
   * Find the most recent eligible undone operation to redo.
   */
  public popRedoCandidate(): string | null {
    if (this.redoCandidates.length === 0) return null;
    return this.redoCandidates.pop() || null;
  }

  public getActiveOperations(): Operation[] {
    return this.operations.filter((op) => {
      if (op.type !== "stroke") return false;
      return !this.undoneOperationIds.has(op.id);
    });
  }
}
