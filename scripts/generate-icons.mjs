// Generates the PWA icons in public/icons from one SVG (run: npm run icons).
// Brand teal ≈ --primary oklch(0.43 0.09 168).
import sharp from "sharp";

const TEAL = "#14665a";

// A receipt with a check mark. `pad` shrinks the art for maskable safe zones.
function svg(size, { pad = 0.18, radius = 0.22, badge = false } = {}) {
  const s = size;
  const inner = s * (1 - pad * 2);
  const x = s * pad;
  const y = s * pad;
  const w = inner * 0.72;
  const h = inner;
  const rx = x + (inner - w) / 2;
  const zig = Array.from({ length: 6 }, (_, i) => {
    const step = w / 6;
    return `L ${rx + step * (i + 0.5)} ${y + h - inner * 0.06} L ${rx + step * (i + 1)} ${y + h}`;
  }).join(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  ${badge ? "" : `<rect width="${s}" height="${s}" rx="${s * radius}" fill="${TEAL}"/>`}
  <path d="M ${rx + w * 0.08} ${y} Q ${rx} ${y} ${rx} ${y + w * 0.08} V ${y + h} ${zig} V ${y + w * 0.08} Q ${rx + w} ${y} ${rx + w * 0.92} ${y} Z" fill="#ffffff"/>
  <path d="M ${rx + w * 0.26} ${y + h * 0.5} L ${rx + w * 0.44} ${y + h * 0.66} L ${rx + w * 0.76} ${y + h * 0.32}"
        fill="none" stroke="${badge ? "#000000" : TEAL}" stroke-opacity="${badge ? 0 : 1}" stroke-width="${s * 0.055}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

const jobs = [
  ["public/icons/icon-192.png", 192, {}],
  ["public/icons/icon-512.png", 512, {}],
  // Maskable: full-bleed background, art inside the 80% safe zone.
  ["public/icons/maskable-512.png", 512, { pad: 0.26, radius: 0 }],
  ["public/icons/apple-touch-icon.png", 180, { radius: 0 }],
  // Android status-bar badge: drawn as a white silhouette, so transparent bg.
  ["public/icons/badge-96.png", 96, { pad: 0.08, badge: true }],
];
for (const [file, size, opts] of jobs) {
  await sharp(Buffer.from(svg(size, opts)))
    .png()
    .toFile(file);
  console.log("wrote", file);
}
