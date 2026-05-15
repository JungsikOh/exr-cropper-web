export const DEFAULT_BOX_COLOR = "#ffd250";
export const DEFAULT_LINE_WIDTH = 3;
export const PNG_GAMMA = 2.2;

export type Region = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CropBox = {
  region: Region;
  color: string;
  lineWidth: number;
};

export type LoadedExr = {
  id: string;
  fileName: string;
  width: number;
  height: number;
  rgba: Float32Array;
};

export type ExportFailure = {
  fileName: string;
  label: string;
  message: string;
};

export function validateRegion(region: Region, imageWidth: number, imageHeight: number): void {
  if (region.width <= 0 || region.height <= 0) {
    throw new Error("Crop width and height must be greater than zero.");
  }
  if (region.x < 0 || region.y < 0) {
    throw new Error("Crop origin must be inside the image.");
  }
  if (region.x + region.width > imageWidth || region.y + region.height > imageHeight) {
    throw new Error(
      `Crop ${regionSuffix(region)} is outside image bounds ${imageWidth}x${imageHeight}.`,
    );
  }
}

export function clampRegion(region: Region, imageWidth: number, imageHeight: number): Region {
  if (imageWidth <= 0 || imageHeight <= 0) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  const x = clampInt(region.x, 0, imageWidth - 1);
  const y = clampInt(region.y, 0, imageHeight - 1);
  const width = clampInt(region.width, 1, imageWidth - x);
  const height = clampInt(region.height, 1, imageHeight - y);
  return { x, y, width, height };
}

export function regionFromPoints(
  start: { x: number; y: number },
  end: { x: number; y: number },
): Region {
  const x0 = Math.min(start.x, end.x);
  const y0 = Math.min(start.y, end.y);
  const x1 = Math.max(start.x, end.x);
  const y1 = Math.max(start.y, end.y);
  return {
    x: x0,
    y: y0,
    width: x1 - x0 + 1,
    height: y1 - y0 + 1,
  };
}

export function regionSuffix(region: Region): string {
  return `x${region.x}_y${region.y}_w${region.width}_h${region.height}`;
}

export function cropOutputStem(fileName: string, region: Region, index: number): string {
  return `${fileStem(fileName)}_r${String(index + 1).padStart(2, "0")}_${regionSuffix(region)}`;
}

export function fileStem(fileName: string): string {
  const lastSlash = Math.max(fileName.lastIndexOf("/"), fileName.lastIndexOf("\\"));
  const baseName = fileName.slice(lastSlash + 1);
  const dot = baseName.lastIndexOf(".");
  return dot > 0 ? baseName.slice(0, dot) : baseName;
}

export function cropRgba(
  rgba: Float32Array,
  imageWidth: number,
  imageHeight: number,
  region: Region,
): Float32Array {
  validateRegion(region, imageWidth, imageHeight);
  const expected = imageWidth * imageHeight * 4;
  if (rgba.length !== expected) {
    throw new Error(`RGBA data has ${rgba.length} values; expected ${expected}.`);
  }

  const cropped = new Float32Array(region.width * region.height * 4);
  const sourceStride = imageWidth * 4;
  const destStride = region.width * 4;
  for (let y = 0; y < region.height; y += 1) {
    const sourceStart = (region.y + y) * sourceStride + region.x * 4;
    const sourceEnd = sourceStart + destStride;
    cropped.set(rgba.subarray(sourceStart, sourceEnd), y * destStride);
  }
  return cropped;
}

export function tonemapRgbaToBytes(
  rgba: Float32Array,
  exposureStops: number,
  gamma = PNG_GAMMA,
): Uint8ClampedArray {
  if (rgba.length % 4 !== 0) {
    throw new Error("RGBA data length must be divisible by 4.");
  }
  if (gamma <= 0) {
    throw new Error("Gamma must be greater than zero.");
  }

  const exposure = 2 ** exposureStops;
  const bytes = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    bytes[i] = tonemapChannel(rgba[i] * exposure, gamma);
    bytes[i + 1] = tonemapChannel(rgba[i + 1] * exposure, gamma);
    bytes[i + 2] = tonemapChannel(rgba[i + 2] * exposure, gamma);
    bytes[i + 3] = alphaChannel(rgba[i + 3]);
  }
  return bytes;
}

export function drawRegionOutlines(
  bytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  boxes: CropBox[],
): void {
  for (const box of boxes) {
    validateRegion(box.region, imageWidth, imageHeight);
    const [r, g, b] = hexToRgb(box.color);
    const lineWidth = Math.max(1, Math.floor(box.lineWidth));
    const maxInset = Math.ceil(Math.min(box.region.width, box.region.height) / 2);

    for (let inset = 0; inset < Math.min(lineWidth, maxInset); inset += 1) {
      const x0 = box.region.x + inset;
      const y0 = box.region.y + inset;
      const x1 = box.region.x + box.region.width - 1 - inset;
      const y1 = box.region.y + box.region.height - 1 - inset;
      drawHorizontal(bytes, imageWidth, imageHeight, y0, x0, x1, r, g, b);
      drawHorizontal(bytes, imageWidth, imageHeight, y1, x0, x1, r, g, b);
      drawVertical(bytes, imageWidth, imageHeight, x0, y0, y1, r, g, b);
      drawVertical(bytes, imageWidth, imageHeight, x1, y0, y1, r, g, b);
    }
  }
}

export function hexToRgb(hex: string): [number, number, number] {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) {
    return [255, 210, 80];
  }
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function tonemapChannel(value: number, gamma: number): number {
  let normalized = value;
  if (Number.isNaN(normalized)) {
    normalized = 0;
  } else if (!Number.isFinite(normalized)) {
    normalized = normalized > 0 ? 1 : 0;
  }
  normalized = Math.min(Math.max(normalized, 0), 1);
  return Math.min(Math.max(Math.floor(normalized ** (1 / gamma) * 255 + 0.5), 0), 255);
}

function alphaChannel(value: number): number {
  if (Number.isNaN(value) || value < 0) {
    return 0;
  }
  if (!Number.isFinite(value) || value > 1) {
    return 255;
  }
  return Math.floor(value * 255 + 0.5);
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.floor(value), min), max);
}

function drawHorizontal(
  bytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  y: number,
  x0: number,
  x1: number,
  r: number,
  g: number,
  b: number,
): void {
  if (y < 0 || y >= imageHeight) {
    return;
  }
  const start = clampInt(x0, 0, imageWidth - 1);
  const end = clampInt(x1, 0, imageWidth - 1);
  for (let x = start; x <= end; x += 1) {
    paintPixel(bytes, imageWidth, x, y, r, g, b);
  }
}

function drawVertical(
  bytes: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  x: number,
  y0: number,
  y1: number,
  r: number,
  g: number,
  b: number,
): void {
  if (x < 0 || x >= imageWidth) {
    return;
  }
  const start = clampInt(y0, 0, imageHeight - 1);
  const end = clampInt(y1, 0, imageHeight - 1);
  for (let y = start; y <= end; y += 1) {
    paintPixel(bytes, imageWidth, x, y, r, g, b);
  }
}

function paintPixel(
  bytes: Uint8ClampedArray,
  imageWidth: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
): void {
  const index = (y * imageWidth + x) * 4;
  bytes[index] = r;
  bytes[index + 1] = g;
  bytes[index + 2] = b;
  bytes[index + 3] = 255;
}
