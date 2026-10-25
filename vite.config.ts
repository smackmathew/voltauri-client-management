/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
  },
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    environment: "node",
    // Tests share one set of emulators; run files one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-firebase": ["firebase/app", "firebase/auth", "firebase/firestore"],
        },
      },
    },
  },
});
