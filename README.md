# EXR Cropper Web

Static GitHub Pages version of the Python EXR Cropper desktop app.

## Features

- Load multiple `.exr` files locally in the browser.
- Select a reference image.
- Create and edit crop boxes by dragging in the preview or editing coordinates.
- Adjust exposure for preview and PNG export.
- Download matching lossless EXR and tonemapped PNG crops plus a reference overlay PNG as `exr-crops.zip`.

## Limits

The EXR crop output preserves all regular full-resolution channels, channel names, and channel pixel types through `@bb-studio/exr`. PNG preview/export is intentionally tonemapped to 8-bit for viewing and figure placement. Deep images, multipart workflows, and subsampled channels are not supported.

For evaluation, use the exported `.exr` files rather than the `.png` files. The PNG files apply exposure, clipping, gamma, and 8-bit quantization.

## Development

```powershell
npm install
npm run dev
```

## Verification

```powershell
npm run typecheck
npm run test
npm run build
```

## GitHub Pages

This project is configured for a project page at:

```text
https://<user>.github.io/exr-cropper-web/
```

The workflow in `.github/workflows/deploy.yml` builds and deploys `dist` on pushes to `main`.
