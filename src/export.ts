import JSZip from "jszip";

import { encodeExrRgba } from "./exr";
import {
  cropOutputStem,
  cropRgba,
  drawRegionOutlines,
  fileStem,
  tonemapRgbaToBytes,
  type CropBox,
  type ExportFailure,
  type LoadedExr,
} from "./processing";

export type ExportResult = {
  blob: Blob;
  cropPairs: number;
  failures: ExportFailure[];
};

export async function buildExportZip(
  images: LoadedExr[],
  boxes: CropBox[],
  refId: string,
  exposureStops: number,
): Promise<ExportResult> {
  const zip = new JSZip();
  const failures: ExportFailure[] = [];
  let cropPairs = 0;

  for (const image of images) {
    for (let index = 0; index < boxes.length; index += 1) {
      const box = boxes[index];
      const label = `r${String(index + 1).padStart(2, "0")}`;
      try {
        const cropped = cropRgba(image.rgba, image.width, image.height, box.region);
        const stem = cropOutputStem(image.fileName, box.region, index);
        const exrBytes = await encodeExrRgba(cropped, box.region.width, box.region.height);
        const pngBytes = tonemapRgbaToBytes(cropped, exposureStops);
        zip.file(`${stem}.exr`, exrBytes);
        zip.file(`${stem}.png`, await pngBlobFromBytes(pngBytes, box.region.width, box.region.height));
        cropPairs += 1;
      } catch (error) {
        failures.push({
          fileName: image.fileName,
          label,
          message: errorMessage(error),
        });
      }
    }
  }

  const refImage = images.find((image) => image.id === refId);
  if (refImage !== undefined) {
    try {
      const overlay = tonemapRgbaToBytes(refImage.rgba, exposureStops);
      drawRegionOutlines(overlay, refImage.width, refImage.height, boxes);
      zip.file(
        `${fileStem(refImage.fileName)}_regions_overlay.png`,
        await pngBlobFromBytes(overlay, refImage.width, refImage.height),
      );
    } catch (error) {
      failures.push({
        fileName: refImage.fileName,
        label: "overlay",
        message: errorMessage(error),
      });
    }
  }

  if (cropPairs === 0 && failures.length > 0) {
    throw new Error(`No crop files were exported. ${failureSummary(failures)}`);
  }

  return {
    blob: await zip.generateAsync({ type: "blob" }),
    cropPairs,
    failures,
  };
}

export function failureSummary(failures: ExportFailure[]): string {
  return failures
    .map((failure) => `${failure.fileName} ${failure.label}: ${failure.message}`)
    .join(" | ");
}

async function pngBlobFromBytes(
  bytes: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Canvas 2D context is unavailable.");
  }
  context.putImageData(imageDataFromBytes(bytes, width, height), 0, 0);
  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error("Failed to encode PNG."));
      } else {
        resolve(blob);
      }
    }, "image/png");
  });
}

function imageDataFromBytes(
  bytes: Uint8ClampedArray,
  width: number,
  height: number,
): ImageData {
  const copy = new Uint8ClampedArray(bytes.length);
  copy.set(bytes);
  return new ImageData(copy, width, height);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
