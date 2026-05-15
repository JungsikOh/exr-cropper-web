import {
  readExr,
  writeExr,
  type DecodedChannel,
  type ExrWindow,
  type WriteExrChannelInput,
} from "@bb-studio/exr";

import {
  findRgbChannelNames,
  type LoadedChannel,
  type LoadedExr,
} from "./processing";

const ZIP_COMPRESSION = 3;

export async function loadExrFile(file: File): Promise<LoadedExr> {
  const result = readExr(await file.arrayBuffer());
  const width = numberFrom(result.part.width, "width");
  const height = numberFrom(result.part.height, "height");
  const channels = decodedChannels(result.part.channels, width, height);

  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${uniqueId()}`,
    fileName: file.name,
    width,
    height,
    channels,
    rgbNames: findRgbChannelNames(channels),
  };
}

export function encodeExrChannels(
  channels: Record<string, LoadedChannel>,
  width: number,
  height: number,
): Uint8Array {
  return writeExr({
    parts: [
      {
        compression: ZIP_COMPRESSION,
        dataWindow: windowFor(width, height),
        displayWindow: windowFor(width, height),
        channels: Object.values(channels).map(toWriteChannel),
      },
    ],
  });
}

function decodedChannels(
  channels: Record<string, DecodedChannel>,
  width: number,
  height: number,
): Record<string, LoadedChannel> {
  const decoded: Record<string, LoadedChannel> = {};
  for (const [name, channel] of Object.entries(channels)) {
    if (
      channel.xSampling !== 1 ||
      channel.ySampling !== 1 ||
      channel.data.length !== width * height
    ) {
      throw new Error(`Channel ${name} is subsampled; subsampled channels are not supported.`);
    }
    decoded[name] = {
      name,
      pixelType: channel.pixelType,
      xSampling: channel.xSampling,
      ySampling: channel.ySampling,
      data: channel.data,
    };
  }
  return decoded;
}

function toWriteChannel(channel: LoadedChannel): WriteExrChannelInput {
  return {
    name: channel.name,
    pixelType: channel.pixelType,
    data: channel.data,
    xSampling: channel.xSampling,
    ySampling: channel.ySampling,
  };
}

function windowFor(width: number, height: number): ExrWindow {
  return { xMin: 0, yMin: 0, xMax: width - 1, yMax: height - 1 };
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
