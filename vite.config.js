import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { geminiProxyPlugin } from "./geminiProxy.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    base: "./",
    plugins: [geminiProxyPlugin(env), vue()],
  };
});
