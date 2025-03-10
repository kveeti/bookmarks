import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
	plugins: [
		solidPlugin(),
		tailwindcss(),
		VitePWA({
			minify: true,
			registerType: "prompt",
			injectRegister: "auto",
			strategies: "generateSW",
			devOptions: {
				enabled: true,
			},
		}),
	],
	build: {
		target: "esnext",
	},
	optimizeDeps: {
		exclude: ["@sqlite.org/sqlite-wasm"],
	},

	clearScreen: false,
	server: {
		port: 3000,
		host: true,
		headers: {
			"Cross-Origin-Opener-Policy": "same-origin",
			"Cross-Origin-Embedder-Policy": "require-corp",
		},
	},
});
