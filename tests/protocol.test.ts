import { describe, it, expect } from "vitest";
import {
  isValidRoomId,
  isValidUserName,
  isValidCoordinate,
  isValidStrokeWidth,
  isValidHexColor,
  isValidPointTuple
} from "../server/protocol";
import { validateStrokePayload } from "../server/drawing-state";

describe("Protocol Validation & Security", () => {
  it("validates room IDs strictly", () => {
    expect(isValidRoomId("design-sprint")).toBe(true);
    expect(isValidRoomId("room_123")).toBe(true);
    expect(isValidRoomId("")).toBe(false);
    expect(isValidRoomId("   ")).toBe(false);
    expect(isValidRoomId("a".repeat(65))).toBe(false);
    expect(isValidRoomId(null)).toBe(false);
    expect(isValidRoomId(123)).toBe(false);
  });

  it("validates user names strictly", () => {
    expect(isValidUserName("Vikas")).toBe(true);
    expect(isValidUserName("Guest Falcon")).toBe(true);
    expect(isValidUserName("")).toBe(false);
    expect(isValidUserName("   ")).toBe(false);
    expect(isValidUserName("a".repeat(33))).toBe(false);
    expect(isValidUserName(undefined)).toBe(false);
  });

  it("validates coordinates preventing NaN and Infinity", () => {
    expect(isValidCoordinate(0)).toBe(true);
    expect(isValidCoordinate(-150.5)).toBe(true);
    expect(isValidCoordinate(1000)).toBe(true);
    expect(isValidCoordinate(NaN)).toBe(false);
    expect(isValidCoordinate(Infinity)).toBe(false);
    expect(isValidCoordinate(-Infinity)).toBe(false);
    expect(isValidCoordinate(1e8)).toBe(false); // exceeds bounds
    expect(isValidCoordinate("100")).toBe(false);
  });

  it("validates stroke widths within [1, 100]", () => {
    expect(isValidStrokeWidth(2)).toBe(true);
    expect(isValidStrokeWidth(4)).toBe(true);
    expect(isValidStrokeWidth(100)).toBe(true);
    expect(isValidStrokeWidth(0)).toBe(false);
    expect(isValidStrokeWidth(-5)).toBe(false);
    expect(isValidStrokeWidth(101)).toBe(false);
    expect(isValidStrokeWidth(NaN)).toBe(false);
    expect(isValidStrokeWidth(Infinity)).toBe(false);
  });

  it("validates 6-digit hex colors strictly", () => {
    expect(isValidHexColor("#6366f1")).toBe(true);
    expect(isValidHexColor("#FFFFFF")).toBe(true);
    expect(isValidHexColor("#000000")).toBe(true);
    expect(isValidHexColor("red")).toBe(false);
    expect(isValidHexColor("#fff")).toBe(false); // only 6-digit hex
    expect(isValidHexColor("#12345G")).toBe(false);
    expect(isValidHexColor("rgb(0,0,0)")).toBe(false);
    expect(isValidHexColor("")).toBe(false);
  });

  it("validates point tuples [x, y]", () => {
    expect(isValidPointTuple([10, 20])).toBe(true);
    expect(isValidPointTuple([-5.5, 100.2])).toBe(true);
    expect(isValidPointTuple([10])).toBe(false);
    expect(isValidPointTuple([10, 20, 30])).toBe(false);
    expect(isValidPointTuple([NaN, 20])).toBe(false);
    expect(isValidPointTuple([10, Infinity])).toBe(false);
    expect(isValidPointTuple("10,20")).toBe(false);
  });

  it("validates full stroke payloads against injection/malformed data", () => {
    const validBrush = {
      id: "stroke_1",
      userId: "user_1",
      tool: "brush",
      style: { color: "#6366f1", width: 4 },
      points: [{ x: 10, y: 10 }, { x: 20, y: 20 }]
    };
    expect(validateStrokePayload(validBrush)).toBe(true);

    const validRect = {
      id: "stroke_2",
      userId: "user_1",
      tool: "rectangle",
      style: { color: "#ec4899", width: 2 },
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 50, y: 50 }
    };
    expect(validateStrokePayload(validRect)).toBe(true);

    // Negative width
    expect(validateStrokePayload({ ...validBrush, style: { color: "#6366f1", width: -10 } })).toBe(false);

    // Invalid color
    expect(validateStrokePayload({ ...validBrush, style: { color: "blue", width: 4 } })).toBe(false);

    // Invalid tool
    expect(validateStrokePayload({ ...validBrush, tool: "magic_wand" })).toBe(false);

    // Point with NaN
    expect(validateStrokePayload({
      ...validBrush,
      points: [{ x: 10, y: 10 }, { x: NaN, y: 20 }]
    })).toBe(false);

    // Empty points
    expect(validateStrokePayload({ ...validBrush, points: [] })).toBe(false);
  });
});
