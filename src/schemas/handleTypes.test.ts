import { describe, expect, it } from "vitest";
import { areHandleTypesCompatible } from "./handleTypes";

describe("areHandleTypesCompatible", () => {
  it("allows matching types", () => {
    expect(areHandleTypesCompatible("text", "text")).toBe(true);
    expect(areHandleTypesCompatible("video", "video")).toBe(true);
  });

  it("allows single media into list inputs", () => {
    expect(areHandleTypesCompatible("video", "video_list")).toBe(true);
    expect(areHandleTypesCompatible("image", "image_list")).toBe(true);
  });

  it("allows list media into single inputs (first item)", () => {
    expect(areHandleTypesCompatible("image_list", "image")).toBe(true);
    expect(areHandleTypesCompatible("video_list", "video")).toBe(true);
    expect(areHandleTypesCompatible("audio_list", "audio")).toBe(true);
  });

  it("blocks incompatible types", () => {
    expect(areHandleTypesCompatible("text", "video")).toBe(false);
    expect(areHandleTypesCompatible("boolean", "number")).toBe(false);
  });

  it("allows text into number and boolean settings", () => {
    expect(areHandleTypesCompatible("text", "number")).toBe(true);
    expect(areHandleTypesCompatible("text", "boolean")).toBe(true);
  });

  it("allows any", () => {
    expect(areHandleTypesCompatible("any", "video")).toBe(true);
    expect(areHandleTypesCompatible("text", "any")).toBe(true);
  });
});
