import { describe, expect, test } from "vitest";

import {
  clampRegion,
  cropOutputStem,
  cropRgba,
  drawRegionOutlines,
  regionSuffix,
  tonemapRgbaToBytes,
  type CropBox,
} from "./processing";

describe("processing", () => {
  test("cropRgba uses pixel bounds", () => {
    const rgba = new Float32Array(5 * 4 * 4);
    for (let i = 0; i < rgba.length; i += 1) {
      rgba[i] = i;
    }

    const cropped = cropRgba(rgba, 5, 4, { x: 1, y: 2, width: 3, height: 2 });

    expect(Array.from(cropped)).toEqual([
      ...Array.from(rgba.subarray((2 * 5 + 1) * 4, (2 * 5 + 4) * 4)),
      ...Array.from(rgba.subarray((3 * 5 + 1) * 4, (3 * 5 + 4) * 4)),
    ]);
  });

  test("tonemapRgbaToBytes applies exposure and gamma", () => {
    const rgba = new Float32Array([0.25, 0.5, 2.0, 1.0]);

    expect(Array.from(tonemapRgbaToBytes(rgba, 1.0, 2.0))).toEqual([180, 255, 255, 255]);
  });

  test("clampRegion matches image bounds", () => {
    expect(clampRegion({ x: -4, y: 3, width: 20, height: 0 }, 10, 8)).toEqual({
      x: 0,
      y: 3,
      width: 10,
      height: 1,
    });
  });

  test("output names match desktop suffix format", () => {
    const region = { x: 10, y: 20, width: 128, height: 96 };

    expect(regionSuffix(region)).toBe("x10_y20_w128_h96");
    expect(cropOutputStem("scene.exr", region, 0)).toBe("scene_r01_x10_y20_w128_h96");
  });

  test("drawRegionOutlines paints box edges", () => {
    const bytes = new Uint8ClampedArray(6 * 5 * 4);
    const boxes: CropBox[] = [
      { region: { x: 1, y: 1, width: 3, height: 2 }, color: "#ff0000", lineWidth: 1 },
      { region: { x: 4, y: 0, width: 2, height: 2 }, color: "#00ff00", lineWidth: 2 },
    ];

    drawRegionOutlines(bytes, 6, 5, boxes);

    expect(Array.from(bytes.subarray((1 * 6 + 1) * 4, (1 * 6 + 1) * 4 + 4))).toEqual([
      255, 0, 0, 255,
    ]);
    expect(Array.from(bytes.subarray((0 * 6 + 4) * 4, (0 * 6 + 4) * 4 + 4))).toEqual([
      0, 255, 0, 255,
    ]);
  });
});
