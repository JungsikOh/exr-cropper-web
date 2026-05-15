import { DataTexture, FloatType, NoColorSpace, RGBAFormat } from "three";
import { EXRExporter, ZIP_COMPRESSION } from "three/addons/exporters/EXRExporter.js";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";

import type { LoadedExr } from "./processing";

export async function loadExrFile(file: File): Promise<LoadedExr> {
  const loader = new EXRLoader();
  loader.setDataType(FloatType);
  loader.setOutputFormat(RGBAFormat);

  const parsed = loader.parse(await file.arrayBuffer());
  const width = numberFrom(parsed.width, "width");
  const height = numberFrom(parsed.height, "height");
  const data = parsed.data;
  if (!(data instanceof Float32Array)) {
    throw new Error("EXR did not decode to Float32 RGBA data.");
  }
  if (data.length !== width * height * 4) {
    throw new Error(`Decoded EXR data does not match ${width}x${height} RGBA pixels.`);
  }

  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${uniqueId()}`,
    fileName: file.name,
    width,
    height,
    rgba: new Float32Array(data),
  };
}

export async function encodeExrRgba(
  rgba: Float32Array,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const texture = new DataTexture(rgba, width, height, RGBAFormat, FloatType);
  texture.colorSpace = NoColorSpace;
  texture.needsUpdate = true;

  const exporter = new EXRExporter();
  return await exporter.parse(texture, {
    compression: ZIP_COMPRESSION,
    type: FloatType,
  });
}

function numberFrom(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Decoded EXR ${label} is invalid.`);
  }
  return value;
}

function uniqueId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
