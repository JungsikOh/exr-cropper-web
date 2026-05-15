# EXR Cropper Web

[Open GitHub Pages](https://jungsikoh.github.io/exr-cropper-web/)

## Demo

![path tracer 1spp and path tracer reference overview](screenshots/demo-pt-ref-overview.png)

The demo uses only `path tracer 1spp` and `path tracer reference`.

## Sample

| 1spp | REF |
| --- | --- |
| ![path tracer 1spp crop](screenshots/sample-pt-1spp-crop.png) | ![path tracer reference crop](screenshots/sample-reference-crop.png) |

**Overlay**

![path tracer reference full-scene overlay](screenshots/sample-reference-overlay.png)

## Usage

1. Open the GitHub Pages link.
2. Click `Add EXR` and select the EXR files to compare.
3. Select the reference file and click `Set Ref`.
4. Add a crop box with `Add Box`, or drag directly on the preview.
5. Adjust `X`, `Y`, `Width`, `Height`, `Line Width`, `Box Color`, and `Exposure` as needed.
6. Press `ArrowUp` or `ArrowDown` to switch scenes while keeping the crop boxes in place.
7. Click `Export Crops` to download `exr-crops.zip`.

## Quality

The exported `.exr` crop was checked against a Python OpenEXR crop from the `path tracer 1spp` sample. `R`, `G`, and `B` were bit-exact with `max_abs=0.0`, so there was no quality or value loss in the EXR output.

Use the exported `.exr` files for evaluation. The preview canvas is rendered from the original EXR channels through a tonemapped 8-bit raster and may be scaled to fit the viewport; `.png` exports are native-resolution tonemapped visual previews for viewing and figures, not bit-exact EXR data.
