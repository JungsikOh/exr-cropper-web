import { defineConfig } from "vite";

export default defineConfig({
  base: "/exr-cropper-web/",
  build: {
    rollupOptions: {
      input: {
        index: "index.source.html",
      },
    },
  },
});
