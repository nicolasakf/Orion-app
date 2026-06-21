import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const iconDirectory = join(projectRoot, "desktop", "build", "icons");
const sourcePath = join(iconDirectory, "icon.png");
const squircleExponent = 4;
const canvasSize = 1024;

/** Builds a smooth superellipse path for the desktop icon's squircle mask. */
function createSquirclePath(size, exponent, pointCount = 512) {
  const radius = size / 2;
  const center = radius;
  const points = Array.from({ length: pointCount }, (_, index) => {
    const angle = (index / pointCount) * Math.PI * 2;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const x = center + radius * Math.sign(cosine) * Math.abs(cosine) ** (2 / exponent);
    const y = center + radius * Math.sign(sine) * Math.abs(sine) ** (2 / exponent);

    return `${index === 0 ? "M" : "L"}${x.toFixed(3)},${y.toFixed(3)}`;
  });

  return `${points.join(" ")} Z`;
}

/** Applies the squircle alpha mask while leaving the icon artwork unchanged. */
async function maskSourceIcon() {
  const mask = Buffer.from(
    `<svg width="${canvasSize}" height="${canvasSize}" viewBox="0 0 ${canvasSize} ${canvasSize}">` +
      `<path d="${createSquirclePath(canvasSize, squircleExponent)}" fill="white"/>` +
      "</svg>",
  );
  const temporaryPath = join(iconDirectory, "icon.squircle.png");
  const source = await sharp(sourcePath).resize(canvasSize, canvasSize).removeAlpha().raw().toBuffer();
  const renderedMask = await sharp(mask).ensureAlpha().raw().toBuffer();
  const maskedIcon = Buffer.alloc(canvasSize * canvasSize * 4);

  for (let pixel = 0; pixel < canvasSize * canvasSize; pixel += 1) {
    const sourceOffset = pixel * 3;
    const outputOffset = pixel * 4;
    maskedIcon[outputOffset] = source[sourceOffset];
    maskedIcon[outputOffset + 1] = source[sourceOffset + 1];
    maskedIcon[outputOffset + 2] = source[sourceOffset + 2];
    maskedIcon[outputOffset + 3] = renderedMask[outputOffset + 3];
  }

  await sharp(maskedIcon, {
    raw: { width: canvasSize, height: canvasSize, channels: 4 },
  })
    .png()
    .toFile(temporaryPath);
  renameSync(temporaryPath, sourcePath);
}

/** Renders a PNG icon variant at the requested square size. */
async function renderPng(size, outputPath) {
  await sharp(sourcePath).resize(size, size, { kernel: sharp.kernel.lanczos3 }).png().toFile(outputPath);
}

/** Packages the standard macOS icon variants into an ICNS file. */
async function createIcnsIcon(temporaryDirectory) {
  const iconsetPath = join(temporaryDirectory, "Orion.iconset");
  const variants = [
    [16, "icon_16x16.png"],
    [32, "icon_16x16@2x.png"],
    [32, "icon_32x32.png"],
    [64, "icon_32x32@2x.png"],
    [128, "icon_128x128.png"],
    [256, "icon_128x128@2x.png"],
    [256, "icon_256x256.png"],
    [512, "icon_256x256@2x.png"],
    [512, "icon_512x512.png"],
    [1024, "icon_512x512@2x.png"],
  ];

  mkdirSync(iconsetPath);
  await Promise.all(variants.map(([size, name]) => renderPng(size, join(iconsetPath, name))));
  execFileSync("iconutil", ["-c", "icns", iconsetPath, "-o", join(iconDirectory, "icon.icns")]);
}

/** Packages PNG variants into a Windows ICO container. */
async function createIcoIcon(temporaryDirectory) {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = await Promise.all(
    sizes.map(async (size) => {
      const outputPath = join(temporaryDirectory, `icon-${size}.png`);
      await renderPng(size, outputPath);
      return { size, data: readFileSync(outputPath) };
    }),
  );
  const headerSize = 6;
  const directoryEntrySize = 16;
  const header = Buffer.alloc(headerSize + directoryEntrySize * images.length);
  let dataOffset = header.length;

  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  images.forEach(({ size, data }, index) => {
    const offset = headerSize + index * directoryEntrySize;
    header.writeUInt8(size === 256 ? 0 : size, offset);
    header.writeUInt8(size === 256 ? 0 : size, offset + 1);
    header.writeUInt8(0, offset + 2);
    header.writeUInt8(0, offset + 3);
    header.writeUInt16LE(1, offset + 4);
    header.writeUInt16LE(32, offset + 6);
    header.writeUInt32LE(data.length, offset + 8);
    header.writeUInt32LE(dataOffset, offset + 12);
    dataOffset += data.length;
  });

  writeFileSync(join(iconDirectory, "icon.ico"), Buffer.concat([header, ...images.map(({ data }) => data)]));
}

/** Generates all desktop icon formats from the canonical PNG source. */
async function generateDesktopIcons() {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "orion-icons-"));

  try {
    await maskSourceIcon();
    await createIcnsIcon(temporaryDirectory);
    await createIcoIcon(temporaryDirectory);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

await generateDesktopIcons();
