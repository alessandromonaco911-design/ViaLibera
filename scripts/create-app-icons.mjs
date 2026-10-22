import { createCanvas } from "@napi-rs/canvas";
import { mkdir, writeFile } from "node:fs/promises";

// Reproduce the existing wordmark; the maskable version keeps it in the safe area.
await mkdir("public/icons", { recursive: true });
for (const [name, size, maskable] of [
  ["app-192", 192, false], ["app-512", 512, false],
  ["app-maskable-512", 512, true], ["apple-touch-icon", 180, false],
]) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#a8def3";
  ctx.fillRect(0, 0, size, size);
  const inset = size * (maskable ? .21 : .13);
  const fontSize = size * (maskable ? .145 : .18);
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.textBaseline = "top";
  ctx.fillStyle = "#111111";
  ctx.fillText("VIA", inset, size * .30);
  ctx.fillRect(inset - size * .015, size * .50, ctx.measureText("LIBERA").width + size * .03, fontSize * 1.12);
  ctx.fillStyle = "#a8def3";
  ctx.fillText("LIBERA", inset, size * .50);
  await writeFile(`public/icons/${name}.png`, canvas.toBuffer("image/png"));
}
