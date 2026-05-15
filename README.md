# EXR Cropper Web

Static GitHub Pages version of the Python EXR Cropper desktop app.

## Features

- Load multiple `.exr` files locally in the browser.
- Select a reference image.
- Create and edit crop boxes by dragging in the preview or editing coordinates.
- Adjust exposure for preview and PNG export.
- Download matching EXR and PNG crops plus a reference overlay PNG as `exr-crops.zip`.

## Limits

The web v1 is RGB(A)-based. It decodes EXR files through Three.js `EXRLoader` and exports RGBA float EXR crops through `EXRExporter`. It does not preserve arbitrary original EXR channels, original channel names, deep images, multipart images, or subsampled channels.

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
