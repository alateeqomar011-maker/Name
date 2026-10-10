import "server-only";
import sharp from "sharp";

// Free-plan watermark. Drawn from vector strokes (no font dependency) so it
// renders identically on any server.

const LETTERS: Record<string, { d: string; w: number }> = {
  V: { d: "M0 0 L30 100 L60 0", w: 60 },
  I: { d: "M0 0 L0 100", w: 0 },
  T: { d: "M0 0 L60 0 M30 0 L30 100", w: 60 },
  R: { d: "M0 100 L0 0 L34 0 Q60 0 60 27 Q60 54 34 54 L0 54 M28 54 L60 100", w: 60 },
  N: { d: "M0 100 L0 0 L60 100 L60 0", w: 60 },
  E: { d: "M56 0 L0 0 L0 100 L56 100 M0 50 L46 50", w: 56 },
};

const GAP = 30;

function wordmark(word = "VITRINE") {
  let x = 0;
  let paths = "";
  for (const ch of word) {
    const l = LETTERS[ch];
    if (!l) continue;
    paths += `<path transform="translate(${x} 0)" d="${l.d}"/>`;
    x += l.w + GAP;
  }
  return { paths, width: x - GAP };
}

/** Diamond mark + wordmark in a 100-unit tall coordinate space. */
function logoGroup() {
  const wm = wordmark();
  const mark = `<path d="M50 0 L100 50 L50 100 L0 50 Z M50 24 L76 50 L50 76 L24 50 Z" fill-rule="evenodd" stroke="none"/>`;
  return {
    svg: `<g>${`<g class="mark">${mark}</g>`}<g transform="translate(140 0)" fill="none" stroke-linecap="round" stroke-linejoin="round">${wm.paths}</g></g>`,
    width: 140 + wm.width,
  };
}

export function watermarkSvg(W: number, H: number) {
  const logo = logoGroup();
  const unit = Math.max(W, H) / 1000;
  const scale = (unit * 26) / 100; // logo height ≈ 2.6% of the long edge
  const tileW = (logo.width + 700) * scale;
  const tileH = 100 * scale * 8.5;
  const stroke = 14;
  const badgeH = 100 * scale * 1.9;
  const badgeW = (logo.width * scale) * 1.0 + badgeH * 0.9;
  const bx = W - badgeW - unit * 22;
  const by = H - badgeH - unit * 22;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs>
<pattern id="wm" patternUnits="userSpaceOnUse" width="${tileW.toFixed(1)}" height="${tileH.toFixed(1)}" patternTransform="rotate(-28)">
  <g transform="translate(${(tileW * 0.1).toFixed(1)} ${(tileH * 0.4).toFixed(1)}) scale(${scale.toFixed(4)})">
    <g fill="#000" stroke="#000" stroke-width="${stroke + 10}" opacity="0.07">${logo.svg}</g>
    <g fill="#fff" stroke="#fff" stroke-width="${stroke}" opacity="0.32">${logo.svg}</g>
  </g>
</pattern>
</defs>
<rect width="${W}" height="${H}" fill="url(#wm)"/>
<g transform="translate(${bx.toFixed(1)} ${by.toFixed(1)})">
  <rect width="${badgeW.toFixed(1)}" height="${badgeH.toFixed(1)}" rx="${(badgeH / 2).toFixed(1)}" fill="#0b0b10" opacity="0.62"/>
  <g transform="translate(${(badgeH * 0.45).toFixed(1)} ${(badgeH * 0.25).toFixed(1)}) scale(${((badgeH * 0.5) / 100).toFixed(4)})" fill="#fff" stroke="#fff" stroke-width="${stroke}">${logo.svg}</g>
</g>
</svg>`;
}

export async function applyWatermark(image: Buffer): Promise<Buffer> {
  const meta = await sharp(image).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (!W || !H) return image;
  const overlay = await sharp(Buffer.from(watermarkSvg(W, H))).png().toBuffer();
  return sharp(image).composite([{ input: overlay }]).png().toBuffer();
}
