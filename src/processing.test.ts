import { describe, expect, test } from "vitest";

import {
  clampRegion,
  cropChannels,
  cropOutputStem,
  drawRegionOutlines,
  regionSuffix,
  tonemapChannelsToBytes,
  type CropBox,
  type LoadedChannel,
} from "./processing";

describe("processing", () => {
  test("cropChannels uses pixel bounds", () => {
    const pixels = new Float32Array(5 * 4);
    for (let i = 0; i < pixels.length; i += 1) {
      pixels[i] = i;
    }
    const channels: Record<string, LoadedChannel> = {
      R: { name: "R", pixelType: 1, xSampling: 1, ySampling: 1, data: pixels },
    };

    const cropped = cropChannels(channels, 5, 4, { x: 1, y: 2, width: 3, height: 2 });

    expect(Array.from(cropped.R.data)).toEqual([11, 12, 13, 16, 17, 18]);
    expect(cropped.R.pixelType).toBe(1);
  });

  test("tonemapChannelsToBytes applies exposure and gamma", () => {
    const channels: Record<string, LoadedChannel> = {
      R: { name: "R", pixelType: 1, xSampling: 1, ySampling: 1, data: new Float32Array([0.25]) },
      G: { name: "G", pixelType: 1, xSampling: 1, ySampling: 1, data: new Float32Array([0.5]) },
      B: { name: "B", pixelType: 1, xSampling: 1, ySampling: 1, data: new Float32Array([2.0]) },
    };

    expect(Array.from(tonemapChannelsToBytes(channels, ["R", "G", "B"], 1.0, 2.0))).toEqual([
      180, 255, 255, 255,
    ]);
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
