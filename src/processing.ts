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

export type LoadedChannel = {
  name: string;
  pixelType: number;
  xSampling: number;
  ySampling: number;
  data: Float32Array;
};

export type LoadedExr = {
  id: string;
  fileName: string;
  width: number;
  height: number;
  channels: Record<string, LoadedChannel>;
  rgbNames: [string, string, string];
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

export function cropChannels(
  channels: Record<string, LoadedChannel>,
  imageWidth: number,
  imageHeight: number,
  region: Region,
): Record<string, LoadedChannel> {
  validateRegion(region, imageWidth, imageHeight);
  const cropped: Record<string, LoadedChannel> = {};
  for (const [name, channel] of Object.entries(channels)) {
    if (channel.data.length !== imageWidth * imageHeight) {
      throw new Error(`Channel ${name} does not match image bounds.`);
    }
    const data = new Float32Array(region.width * region.height);
    for (let y = 0; y < region.height; y += 1) {
      const sourceStart = (region.y + y) * imageWidth + region.x;
      data.set(channel.data.subarray(sourceStart, sourceStart + region.width), y * region.width);
    }
    cropped[name] = { ...channel, data };
  }
  return cropped;
}

export function tonemapChannelsToBytes(
  channels: Record<string, LoadedChannel>,
  rgbNames: [string, string, string],
  exposureStops: number,
  gamma = PNG_GAMMA,
): Uint8ClampedArray {
  if (gamma <= 0) {
    throw new Error("Gamma must be greater than zero.");
  }
  const [rName, gName, bName] = rgbNames;
  const red = channels[rName]?.data;
  const green = channels[gName]?.data;
  const blue = channels[bName]?.data;
  if (red === undefined || green === undefined || blue === undefined) {
    throw new Error("The EXR must contain R, G, and B channels for PNG preview/export.");
  }
  if (red.length !== green.length || red.length !== blue.length) {
    throw new Error("RGB channel sizes do not match.");
  }

  const exposure = 2 ** exposureStops;
  const bytes = new Uint8ClampedArray(red.length * 4);
  for (let pixel = 0; pixel < red.length; pixel += 1) {
    const out = pixel * 4;
    bytes[out] = tonemapChannel(red[pixel] * exposure, gamma);
    bytes[out + 1] = tonemapChannel(green[pixel] * exposure, gamma);
    bytes[out + 2] = tonemapChannel(blue[pixel] * exposure, gamma);
    bytes[out + 3] = 255;
  }
  return bytes;
}

export function findRgbChannelNames(channels: Record<string, LoadedChannel>): [string, string, string] {
  if ("R" in channels && "G" in channels && "B" in channels) {
    return ["R", "G", "B"];
  }

  const layers = new Map<string, Partial<Record<"R" | "G" | "B", string>>>();
  for (const name of Object.keys(channels)) {
    const dot = name.lastIndexOf(".");
    if (dot < 0) {
      continue;
    }
    const prefix = name.slice(0, dot);
    const component = name.slice(dot + 1);
    if (component === "R" || component === "G" || component === "B") {
      const layer = layers.get(prefix) ?? {};
      layer[component] = name;
      layers.set(prefix, layer);
    }
  }

  for (const prefix of [...layers.keys()].sort()) {
    const layer = layers.get(prefix);
    if (layer?.R !== undefined && layer.G !== undefined && layer.B !== undefined) {
      return [layer.R, layer.G, layer.B];
    }
  }

  throw new Error("The EXR must contain R, G, and B channels for PNG preview/export.");
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
