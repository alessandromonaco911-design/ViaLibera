import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import { mkdir, readFile, writeFile } from "node:fs/promises";

// Run from the project root: node scripts/create-app-icons.mjs.
// One vector mark feeds the UI, Home icons, share cover and static iOS startup.
await mkdir("public/icons", { recursive: true });
await mkdir("public/brand", { recursive: true });
const mark = await loadImage(await readFile("public/brand/traffic-light.svg"));
const fontLoaded = GlobalFonts.registerFromPath("node_modules/next/dist/next-devtools/server/font/geist-latin.woff2", "BrandGeist");
if (!fontLoaded) throw new Error("Bundled Geist font unavailable");
const colors = { blue: "#a8def3", cream: "#f4f0e8", yellow: "#ffe99a", ink: "#111111" };
function background(ctx, width, height, color) { ctx.fillStyle = color; ctx.fillRect(0, 0, width, height); }
// Canvas exposes the bundled variable font at its default weight; embolden the
// static artwork explicitly so it matches the browser's heavy brand treatment.
function boldText(ctx, text, x, y, size) {
  ctx.save(); ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = size * .025;
  ctx.lineJoin = "round"; ctx.strokeText(text, x, y); ctx.fillText(text, x, y); ctx.restore();
}
function drawBrand(ctx, x, y, height) {
  ctx.drawImage(mark, x, y, height * 48 / 108, height);
  ctx.fillStyle = colors.ink;
  ctx.font = `800 ${height * .65}px BrandGeist`;
  ctx.textBaseline = "middle";
  boldText(ctx, "ViaLibera", x + height * .65, y + height / 2, height * .65);
}
for (const [name, size, maskable] of [
  ["app-192", 192, false], ["app-512", 512, false],
  ["app-maskable-512", 512, true], ["apple-touch-icon", 180, false],
]) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  background(ctx, size, size, colors.yellow);
  const height = size * (maskable ? .60 : .68), width = height * 48 / 108;
  ctx.drawImage(mark, (size - width) / 2, (size - height) / 2, width, height);
  await writeFile(`public/icons/${name}.png`, canvas.toBuffer("image/png"));
}

// PNG-in-ICO: supported by modern browsers; keeps the favicon aligned with the app.
const favicon = createCanvas(48, 48), faviconContext = favicon.getContext("2d");
background(faviconContext, 48, 48, colors.yellow);
faviconContext.drawImage(mark, 15, 4, 18, 40);
const png = favicon.toBuffer("image/png"), ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico[6] = 48; ico[7] = 48; ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);
await writeFile("src/app/favicon.ico", Buffer.concat([ico, png]));

const cover = createCanvas(1200, 630), ctx = cover.getContext("2d");
background(ctx, 1200, 630, colors.blue);
drawBrand(ctx, 64, 48, 90);
ctx.fillStyle = colors.yellow; ctx.fillRect(944, 58, 192, 54);
ctx.strokeStyle = colors.ink; ctx.lineWidth = 3; ctx.strokeRect(944, 58, 192, 54);
ctx.fillStyle = colors.ink; ctx.font = "700 27px BrandGeist"; ctx.textBaseline = "middle";
ctx.fillText("PATENTE B", 965, 85);
ctx.font = "800 104px BrandGeist"; ctx.textBaseline = "alphabetic";
boldText(ctx, "La patente.", 60, 300, 104);
const line = "Un quiz alla volta.";
const size = Math.min(104, 1076 / ctx.measureText(line).width * 104);
ctx.font = `800 ${size}px BrandGeist`; boldText(ctx, line, 60, 416, size);
ctx.font = "500 29px BrandGeist"; ctx.fillText("Quiz, allenamento e spiegazioni.", 64, 555);
ctx.fillStyle = colors.cream; ctx.fillRect(1038, 505, 98, 72);
ctx.strokeRect(1038, 505, 98, 72);
ctx.beginPath(); ctx.moveTo(1064, 541); ctx.lineTo(1110, 541); ctx.moveTo(1093, 523); ctx.lineTo(1111, 541); ctx.lineTo(1093, 559); ctx.lineWidth = 4; ctx.stroke();
await writeFile("public/brand/share-v2.png", cover.toBuffer("image/png"));

// Static native launch images; the animated scene starts in the web document.
for (const [width, height] of [[375, 812], [390, 844], [393, 852]]) {
  for (const orientation of ["portrait", "landscape"]) {
    const w = (orientation === "portrait" ? width : height) * 3;
    const h = (orientation === "portrait" ? height : width) * 3;
    const canvas = createCanvas(w, h), ctx = canvas.getContext("2d");
    background(ctx, w, h, colors.blue);
    const logoHeight = 162;
    ctx.font = `800 ${logoHeight * .65}px BrandGeist`;
    const logoWidth = logoHeight * .65 + ctx.measureText("ViaLibera").width;
    drawBrand(ctx, (w - logoWidth) / 2, (h - logoHeight) / 2, logoHeight);
    await writeFile(`public/brand/startup-${width}x${height}-${orientation}.png`, canvas.toBuffer("image/png"));
  }
}
console.log("Generated shared-brand icons, favicon, share cover and six static iOS startup images.");
