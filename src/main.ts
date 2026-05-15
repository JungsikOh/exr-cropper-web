import "./style.css";

import {
  Download,
  FilePlus2,
  Minus,
  Plus,
  Star,
  Trash2,
  createElement as createIcon,
  type IconNode,
} from "lucide";

import { buildExportZip, failureSummary } from "./export";
import { loadExrFile } from "./exr";
import {
  DEFAULT_BOX_COLOR,
  DEFAULT_LINE_WIDTH,
  clampRegion,
  cropOutputStem,
  hexToRgb,
  regionFromPoints,
  tonemapChannelsToBytes,
  type CropBox,
  type LoadedExr,
} from "./processing";

type ImagePoint = {
  x: number;
  y: number;
};

type DisplayRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const state = {
  images: [] as LoadedExr[],
  currentId: null as string | null,
  refId: null as string | null,
  boxes: [] as CropBox[],
  activeBoxIndex: -1,
  exposureStops: 0,
  previewRaster: null as HTMLCanvasElement | null,
  dragAnchor: null as ImagePoint | null,
};

const elements = {
  fileInput: byId<HTMLInputElement>("file-input"),
  addFiles: byId<HTMLButtonElement>("add-files"),
  removeFile: byId<HTMLButtonElement>("remove-file"),
  fileList: byId<HTMLUListElement>("file-list"),
  setRef: byId<HTMLButtonElement>("set-ref"),
  refLabel: byId<HTMLDivElement>("ref-label"),
  boxList: byId<HTMLUListElement>("box-list"),
  addBox: byId<HTMLButtonElement>("add-box"),
  removeBox: byId<HTMLButtonElement>("remove-box"),
  boxColor: byId<HTMLInputElement>("box-color"),
  coordX: byId<HTMLInputElement>("coord-x"),
  coordY: byId<HTMLInputElement>("coord-y"),
  coordW: byId<HTMLInputElement>("coord-w"),
  coordH: byId<HTMLInputElement>("coord-h"),
  lineWidth: byId<HTMLInputElement>("line-width"),
  exposure: byId<HTMLInputElement>("exposure"),
  exposureValue: byId<HTMLOutputElement>("exposure-value"),
  exportButton: byId<HTMLButtonElement>("export"),
  status: byId<HTMLDivElement>("status"),
  imageMeta: byId<HTMLDivElement>("image-meta"),
  preview: byId<HTMLCanvasElement>("preview"),
  workspace: document.querySelector<HTMLElement>(".workspace"),
  dropHint: byId<HTMLDivElement>("drop-hint"),
};

if (elements.workspace === null) {
  throw new Error("Workspace element is missing.");
}

setButton(elements.addFiles, "Add EXR", FilePlus2);
setButton(elements.removeFile, "Remove", Trash2);
setButton(elements.setRef, "Set Ref", Star);
setButton(elements.addBox, "Add Box", Plus);
setButton(elements.removeBox, "Remove Box", Minus);
setButton(elements.exportButton, "Export Crops", Download);

elements.addFiles.addEventListener("click", () => elements.fileInput.click());
elements.fileInput.addEventListener("change", () => {
  void loadFiles(Array.from(elements.fileInput.files ?? []));
  elements.fileInput.value = "";
});
elements.removeFile.addEventListener("click", removeCurrentFile);
elements.setRef.addEventListener("click", setCurrentAsRef);
elements.addBox.addEventListener("click", addBox);
elements.removeBox.addEventListener("click", removeActiveBox);
elements.boxColor.addEventListener("input", updateActiveBoxFromControls);
elements.lineWidth.addEventListener("input", updateActiveBoxFromControls);
for (const input of [elements.coordX, elements.coordY, elements.coordW, elements.coordH]) {
  input.addEventListener("input", updateActiveBoxFromControls);
}
elements.exposure.addEventListener("input", () => {
  state.exposureStops = Number(elements.exposure.value);
  elements.exposureValue.value = `${state.exposureStops.toFixed(2)} stops`;
  rebuildPreviewRaster();
  renderPreview();
});
elements.exportButton.addEventListener("click", () => void exportCrops());

elements.workspace.addEventListener("dragover", (event) => {
  event.preventDefault();
  elements.workspace?.classList.add("dragging");
});
elements.workspace.addEventListener("dragleave", () => {
  elements.workspace?.classList.remove("dragging");
});
elements.workspace.addEventListener("drop", (event) => {
  event.preventDefault();
  elements.workspace?.classList.remove("dragging");
  void loadFiles(Array.from(event.dataTransfer?.files ?? []));
});

elements.preview.addEventListener("pointerdown", beginDrag);
elements.preview.addEventListener("pointermove", continueDrag);
elements.preview.addEventListener("pointerup", endDrag);
elements.preview.addEventListener("pointercancel", endDrag);
document.addEventListener("keydown", handleKeyboardNavigation);

new ResizeObserver(renderPreview).observe(elements.preview);
syncUi();

async function loadFiles(files: File[]): Promise<void> {
  const exrFiles = files.filter((file) => /\.exr$/i.test(file.name));
  if (exrFiles.length === 0) {
    setStatus("No EXR files selected.");
    return;
  }

  setStatus(`Loading ${exrFiles.length} file(s)...`);
  const failures: string[] = [];
  let loadedCount = 0;
  const existing = new Set(state.images.map((image) => image.fileName));

  for (const file of exrFiles) {
    if (existing.has(file.name)) {
      continue;
    }
    try {
      const image = await loadExrFile(file);
      state.images.push(image);
      state.currentId ??= image.id;
      existing.add(file.name);
      loadedCount += 1;
    } catch (error) {
      failures.push(`${file.name}: ${errorMessage(error)}`);
    }
  }

  rebuildPreviewRaster();
  syncUi();
  const refMessage = state.refId === null ? " Set a reference before export." : "";
  const failureMessage = failures.length > 0 ? ` Failed: ${failures.join(" | ")}` : "";
  setStatus(`Loaded ${loadedCount} file(s).${refMessage}${failureMessage}`);
}

function removeCurrentFile(): void {
  const currentIndex = state.images.findIndex((image) => image.id === state.currentId);
  if (currentIndex < 0) {
    return;
  }
  const [removed] = state.images.splice(currentIndex, 1);
  if (state.refId === removed.id) {
    state.refId = null;
  }
  const next = state.images[Math.min(currentIndex, state.images.length - 1)];
  state.currentId = next?.id ?? null;
  rebuildPreviewRaster();
  syncUi();
  setStatus(state.images.length > 0 ? `Removed ${removed.fileName}.` : "No EXR loaded.");
}

function handleKeyboardNavigation(event: KeyboardEvent): void {
  if (event.defaultPrevented || isTextEditingTarget(event.target)) {
    return;
  }
  if (event.key === "ArrowUp") {
    if (switchScene(-1)) {
      event.preventDefault();
    }
  } else if (event.key === "ArrowDown") {
    if (switchScene(1)) {
      event.preventDefault();
    }
  }
}

function switchScene(direction: -1 | 1): boolean {
  if (state.images.length < 2) {
    return false;
  }
  const currentIndex = Math.max(
    0,
    state.images.findIndex((image) => image.id === state.currentId),
  );
  const nextIndex = (currentIndex + direction + state.images.length) % state.images.length;
  const next = state.images[nextIndex];
  state.currentId = next.id;
  rebuildPreviewRaster();
  syncUi();
  setStatus(`Scene ${nextIndex + 1}/${state.images.length}: ${next.width}x${next.height}.`);
  return true;
}

function setCurrentAsRef(): void {
  const current = currentImage();
  if (current === undefined) {
    return;
  }
  state.refId = current.id;
  syncUi();
  setStatus(`Reference set to ${current.fileName}.`);
}

function addBox(): void {
  const image = currentImage();
  if (image === undefined) {
    return;
  }
  const width = Math.max(1, Math.floor(image.width / 3));
  const height = Math.max(1, Math.floor(image.height / 3));
  state.boxes.push({
    region: {
      x: Math.max(0, Math.floor((image.width - width) / 2)),
      y: Math.max(0, Math.floor((image.height - height) / 2)),
      width,
      height,
    },
    color: DEFAULT_BOX_COLOR,
    lineWidth: DEFAULT_LINE_WIDTH,
  });
  state.activeBoxIndex = state.boxes.length - 1;
  syncUi();
}

function removeActiveBox(): void {
  if (!hasActiveBox()) {
    return;
  }
  state.boxes.splice(state.activeBoxIndex, 1);
  state.activeBoxIndex = state.boxes.length === 0 ? -1 : Math.min(state.activeBoxIndex, state.boxes.length - 1);
  syncUi();
}

function updateActiveBoxFromControls(): void {
  const image = currentImage();
  if (image === undefined || !hasActiveBox()) {
    return;
  }
  const box = state.boxes[state.activeBoxIndex];
  box.region = clampRegion(
    {
      x: readInt(elements.coordX, 0),
      y: readInt(elements.coordY, 0),
      width: readInt(elements.coordW, 1),
      height: readInt(elements.coordH, 1),
    },
    image.width,
    image.height,
  );
  box.color = elements.boxColor.value;
  box.lineWidth = readInt(elements.lineWidth, DEFAULT_LINE_WIDTH);
  syncUi();
}

async function exportCrops(): Promise<void> {
  if (state.refId === null || state.images.length === 0 || state.boxes.length === 0) {
    return;
  }

  elements.exportButton.disabled = true;
  setStatus("Exporting crops...");
  try {
    const result = await buildExportZip(
      state.images,
      state.boxes,
      state.refId,
      state.exposureStops,
    );
    downloadBlob(result.blob, "exr-crops.zip");
    const suffix = result.failures.length > 0 ? ` Failed: ${failureSummary(result.failures)}` : "";
    setStatus(`Exported ${result.cropPairs} crop pair(s) and reference overlay.${suffix}`);
  } catch (error) {
    setStatus(errorMessage(error));
  } finally {
    syncUi();
  }
}

function beginDrag(event: PointerEvent): void {
  const image = currentImage();
  const point = canvasToImagePoint(event, false);
  if (image === undefined || point === null) {
    return;
  }
  state.dragAnchor = point;
  if (!hasActiveBox()) {
    state.boxes.push({
      region: { x: point.x, y: point.y, width: 1, height: 1 },
      color: DEFAULT_BOX_COLOR,
      lineWidth: DEFAULT_LINE_WIDTH,
    });
    state.activeBoxIndex = state.boxes.length - 1;
  }
  updateDragRegion(image, point);
  elements.preview.setPointerCapture(event.pointerId);
}

function continueDrag(event: PointerEvent): void {
  const image = currentImage();
  if (state.dragAnchor === null || image === undefined) {
    return;
  }
  const point = canvasToImagePoint(event, true);
  if (point !== null) {
    updateDragRegion(image, point);
  }
}

function endDrag(event: PointerEvent): void {
  state.dragAnchor = null;
  if (elements.preview.hasPointerCapture(event.pointerId)) {
    elements.preview.releasePointerCapture(event.pointerId);
  }
}

function updateDragRegion(image: LoadedExr, point: ImagePoint): void {
  if (!hasActiveBox() || state.dragAnchor === null) {
    return;
  }
  state.boxes[state.activeBoxIndex].region = clampRegion(
    regionFromPoints(state.dragAnchor, point),
    image.width,
    image.height,
  );
  syncUi();
}

function rebuildPreviewRaster(): void {
  const image = currentImage();
  if (image === undefined) {
    state.previewRaster = null;
    return;
  }
  const bytes = tonemapChannelsToBytes(image.channels, image.rgbNames, state.exposureStops);
  const raster = document.createElement("canvas");
  raster.width = image.width;
  raster.height = image.height;
  const context = raster.getContext("2d");
  if (context === null) {
    throw new Error("Canvas 2D context is unavailable.");
  }
  context.putImageData(imageDataFromBytes(bytes, image.width, image.height), 0, 0);
  state.previewRaster = raster;
}

function renderPreview(): void {
  const context = elements.preview.getContext("2d");
  if (context === null) {
    return;
  }
  const canvasRect = resizeCanvasForDisplay();
  context.clearRect(0, 0, canvasRect.width, canvasRect.height);
  context.fillStyle = "#14171b";
  context.fillRect(0, 0, canvasRect.width, canvasRect.height);

  const image = currentImage();
  const displayRect = image === undefined ? null : displayRectFor(image, canvasRect.width, canvasRect.height);
  if (image === undefined || displayRect === null || state.previewRaster === null) {
    elements.dropHint.classList.remove("hidden");
    return;
  }

  elements.dropHint.classList.add("hidden");
  context.imageSmoothingEnabled = displayRect.width !== image.width || displayRect.height !== image.height;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    state.previewRaster,
    displayRect.x,
    displayRect.y,
    displayRect.width,
    displayRect.height,
  );
  context.strokeStyle = "#414956";
  context.lineWidth = 1;
  context.strokeRect(displayRect.x, displayRect.y, displayRect.width, displayRect.height);
  drawBoxes(context, image, displayRect);
}

function drawBoxes(
  context: CanvasRenderingContext2D,
  image: LoadedExr,
  displayRect: DisplayRect,
): void {
  const scaleX = displayRect.width / image.width;
  const scaleY = displayRect.height / image.height;
  state.boxes.forEach((box, index) => {
    const active = index === state.activeBoxIndex;
    const region = box.region;
    const x = displayRect.x + region.x * scaleX;
    const y = displayRect.y + region.y * scaleY;
    const width = region.width * scaleX;
    const height = region.height * scaleY;

    context.save();
    context.strokeStyle = box.color;
    context.globalAlpha = active ? 1 : 0.65;
    context.lineWidth = Math.max(1, box.lineWidth);
    context.strokeRect(x, y, width, height);
    context.restore();

    drawBoxLabel(context, `r${String(index + 1).padStart(2, "0")}`, box, x, y, displayRect);
  });
}

function drawBoxLabel(
  context: CanvasRenderingContext2D,
  label: string,
  box: CropBox,
  x: number,
  y: number,
  displayRect: DisplayRect,
): void {
  context.save();
  context.font = "12px system-ui, sans-serif";
  const paddingX = 6;
  const width = Math.ceil(context.measureText(label).width) + paddingX * 2;
  const height = 22;
  const labelX = Math.min(Math.max(x, displayRect.x), displayRect.x + displayRect.width - width);
  let labelY = y - height - 5;
  if (labelY < displayRect.y) {
    labelY = y + 5;
  }
  labelY = Math.min(labelY, displayRect.y + displayRect.height - height);
  const [r, g, b] = hexToRgb(box.color);
  context.fillStyle = "rgba(15, 17, 20, 0.88)";
  context.fillRect(labelX, labelY, width, height);
  context.strokeStyle = `rgb(${r}, ${g}, ${b})`;
  context.strokeRect(labelX + 0.5, labelY + 0.5, width - 1, height - 1);
  context.fillStyle = "#f6f7f9";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, labelX + width / 2, labelY + height / 2);
  context.restore();
}

function syncUi(): void {
  renderFileList();
  renderBoxList();
  syncControls();
  syncButtons();
  renderPreview();
}

function renderFileList(): void {
  elements.fileList.replaceChildren();
  for (const image of state.images) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = listItemClass(image.id === state.currentId, image.id === state.refId);
    button.title = `${image.fileName} (${image.width}x${image.height})`;
    if (image.id === state.refId) {
      const marker = document.createElement("span");
      marker.className = "ref-marker";
      marker.textContent = "[REF]";
      button.append(marker, " ");
    }
    const fileName = document.createElement("span");
    fileName.className = "file-name";
    fileName.textContent = image.fileName;
    button.append(fileName);
    button.addEventListener("click", () => {
      state.currentId = image.id;
      rebuildPreviewRaster();
      syncUi();
      setStatus(`Loaded ${image.fileName} (${image.width}x${image.height}).`);
    });
    item.append(button);
    elements.fileList.append(item);
  }
  const ref = state.images.find((image) => image.id === state.refId);
  elements.refLabel.textContent = ref === undefined ? "Ref: none" : `Ref: ${ref.fileName}`;
  const current = currentImage();
  elements.imageMeta.textContent =
    current === undefined ? "No EXR loaded" : `${current.fileName}  ${current.width}x${current.height}`;
}

function listItemClass(active: boolean, ref: boolean): string {
  return ["list-item", active ? "active" : "", ref ? "ref" : ""].filter(Boolean).join(" ");
}

function renderBoxList(): void {
  elements.boxList.replaceChildren();
  state.boxes.forEach((box, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = index === state.activeBoxIndex ? "list-item active" : "list-item";
    button.textContent = `${cropOutputStem("region.exr", box.region, index).replace("region_", "")}, line=${box.lineWidth}`;
    button.title = box.color;
    button.addEventListener("click", () => {
      state.activeBoxIndex = index;
      syncUi();
    });
    item.append(button);
    elements.boxList.append(item);
  });
}

function syncControls(): void {
  const box = hasActiveBox() ? state.boxes[state.activeBoxIndex] : null;
  const inputs = [
    elements.coordX,
    elements.coordY,
    elements.coordW,
    elements.coordH,
    elements.lineWidth,
    elements.boxColor,
  ];

  for (const input of inputs) {
    input.disabled = box === null;
  }

  if (box === null) {
    elements.coordX.value = "0";
    elements.coordY.value = "0";
    elements.coordW.value = "0";
    elements.coordH.value = "0";
    elements.lineWidth.value = String(DEFAULT_LINE_WIDTH);
    elements.boxColor.value = DEFAULT_BOX_COLOR;
    return;
  }

  elements.coordX.value = String(box.region.x);
  elements.coordY.value = String(box.region.y);
  elements.coordW.value = String(box.region.width);
  elements.coordH.value = String(box.region.height);
  elements.lineWidth.value = String(box.lineWidth);
  elements.boxColor.value = box.color;
}

function syncButtons(): void {
  const hasCurrent = currentImage() !== undefined;
  elements.removeFile.disabled = !hasCurrent;
  elements.setRef.disabled = !hasCurrent;
  elements.addBox.disabled = !hasCurrent;
  elements.removeBox.disabled = !hasActiveBox();
  elements.exportButton.disabled = state.images.length === 0 || state.refId === null || state.boxes.length === 0;
}

function canvasToImagePoint(event: PointerEvent, clamp: boolean): ImagePoint | null {
  const image = currentImage();
  if (image === undefined) {
    return null;
  }
  const canvasRect = elements.preview.getBoundingClientRect();
  const displayRect = displayRectFor(image, canvasRect.width, canvasRect.height);
  if (displayRect === null) {
    return null;
  }
  const x = event.clientX - canvasRect.left;
  const y = event.clientY - canvasRect.top;
  if (
    !clamp &&
    (x < displayRect.x ||
      y < displayRect.y ||
      x > displayRect.x + displayRect.width ||
      y > displayRect.y + displayRect.height)
  ) {
    return null;
  }
  const relativeX = clamp01((x - displayRect.x) / displayRect.width);
  const relativeY = clamp01((y - displayRect.y) / displayRect.height);
  return {
    x: Math.min(Math.floor(relativeX * image.width), image.width - 1),
    y: Math.min(Math.floor(relativeY * image.height), image.height - 1),
  };
}

function displayRectFor(image: LoadedExr, canvasWidth: number, canvasHeight: number): DisplayRect | null {
  if (canvasWidth <= 0 || canvasHeight <= 0) {
    return null;
  }
  const scale = Math.min(canvasWidth / image.width, canvasHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    x: (canvasWidth - width) / 2,
    y: (canvasHeight - height) / 2,
    width,
    height,
  };
}

function resizeCanvasForDisplay(): { width: number; height: number } {
  const rect = elements.preview.getBoundingClientRect();
  const pixelRatio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  const bitmapWidth = Math.max(1, Math.floor(width * pixelRatio));
  const bitmapHeight = Math.max(1, Math.floor(height * pixelRatio));
  if (elements.preview.width !== bitmapWidth || elements.preview.height !== bitmapHeight) {
    elements.preview.width = bitmapWidth;
    elements.preview.height = bitmapHeight;
  }
  const context = elements.preview.getContext("2d");
  context?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  return { width, height };
}

function currentImage(): LoadedExr | undefined {
  return state.images.find((image) => image.id === state.currentId);
}

function hasActiveBox(): boolean {
  return state.activeBoxIndex >= 0 && state.activeBoxIndex < state.boxes.length;
}

function readInt(input: HTMLInputElement, fallback: number): number {
  const value = Number(input.value);
  return Number.isFinite(value) ? Math.floor(value) : fallback;
}

function setStatus(message: string): void {
  elements.status.textContent = message;
}

function setButton(button: HTMLButtonElement, label: string, icon: IconNode): void {
  button.textContent = "";
  const svg = createIcon([
    "svg",
    {
      "aria-hidden": "true",
      width: 17,
      height: 17,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    },
    icon,
  ]);
  const span = document.createElement("span");
  span.textContent = label;
  button.append(svg, span);
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

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Missing element #${id}.`);
  }
  return element as T;
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
