import "server-only";
import sharp, { type OverlayOptions } from "sharp";
import { mix, shade } from "./color";
import { extractPalette } from "./tools";

// Presentation mockups: show a product render or ad inside a phone feed, a
// story, an online store page or a framed print. Interface details are drawn
// as neutral placeholder shapes (no fake brand UI or text).

export const MOCKUP_TEMPLATES = [
  { id: "phone-post", name: "Phone · feed post", width: 2048, height: 2048 },
  { id: "phone-story", name: "Phone · story", width: 2048, height: 2048 },
  { id: "browser-pdp", name: "Online store page", width: 2400, height: 1500 },
  { id: "poster-frame", name: "Framed print", width: 1640, height: 2048 },
] as const;

export type MockupTemplate = (typeof MOCKUP_TEMPLATES)[number]["id"];

const f = (n: number) => n.toFixed(1);

async function rounded(image: Buffer, w: number, h: number, r: number, fit: "cover" | "contain", bg = "#f4f4f5") {
  const resized = await sharp(image)
    .resize(Math.round(w), Math.round(h), { fit, background: bg, kernel: "lanczos3" })
    .flatten({ background: bg })
    .png()
    .toBuffer();
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w)}" height="${Math.round(h)}"><rect width="100%" height="100%" rx="${f(r)}" ry="${f(r)}" fill="#fff"/></svg>`,
  );
  return sharp(resized).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

const ICONS = {
  heart: "M12 21s-7.5-4.6-9.6-9.2C1 8.6 3 5 6.6 5c2 0 3.4 1.1 4.4 2.6C12 6.1 13.4 5 15.4 5 19 5 21 8.6 19.6 11.8 17.5 16.4 12 21 12 21z",
  comment: "M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  send: "M3 11.5 21 3l-7.5 18-2.6-7.4L3 11.5z",
  bookmark: "M6 3h12v18l-6-4.5L6 21z",
  star: "M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z",
};

function icon(path: string, x: number, y: number, size: number, stroke: string, fill = "none") {
  const s = size / 24;
  return `<path d="${path}" transform="translate(${f(x)} ${f(y)}) scale(${s.toFixed(3)})" fill="${fill}" stroke="${stroke}" stroke-width="${(1.8).toFixed(1)}" stroke-linejoin="round"/>`;
}

function bar(x: number, y: number, w: number, h: number, color: string) {
  return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(h / 2)}" fill="${color}"/>`;
}

function phoneFrame(W: number, H: number, bgA: string, bgB: string) {
  const ph = H * 0.88;
  const pw = ph * 0.49;
  const px = (W - pw) / 2;
  const py = (H - ph) / 2;
  const r = pw * 0.14;
  const bezel = pw * 0.035;
  const screen = { x: px + bezel, y: py + bezel, w: pw - bezel * 2, h: ph - bezel * 2, r: r - bezel };
  const back = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bgA}"/><stop offset="1" stop-color="${bgB}"/></linearGradient>
<filter id="sh" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f(W * 0.025)}"/></filter>
<linearGradient id="metal" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a2a2e"/><stop offset="0.5" stop-color="#121214"/><stop offset="1" stop-color="#2a2a2e"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<rect x="${f(px + pw * 0.06)}" y="${f(py + ph * 0.06)}" width="${f(pw * 0.92)}" height="${f(ph * 0.94)}" rx="${f(r)}" fill="#000" opacity="0.28" filter="url(#sh)"/>
<rect x="${f(px)}" y="${f(py)}" width="${f(pw)}" height="${f(ph)}" rx="${f(r)}" fill="url(#metal)"/>
<rect x="${f(screen.x)}" y="${f(screen.y)}" width="${f(screen.w)}" height="${f(screen.h)}" rx="${f(screen.r)}" fill="#ffffff"/>
</svg>`;
  return { back, screen, pw, ph, px, py };
}

export async function renderMockup(template: MockupTemplate, image: Buffer): Promise<Buffer> {
  const palette = await extractPalette(image, 4);
  const accent = palette[0] ?? "#d9d4cc";
  const bgA = mix(accent, "#ffffff", 0.82);
  const bgB = mix(accent, "#ffffff", 0.6);

  if (template === "phone-post" || template === "phone-story") {
    const W = 2048;
    const H = 2048;
    const { back, screen } = phoneFrame(W, H, bgA, bgB);
    const layers: OverlayOptions[] = [];
    const s = screen;
    const u = s.w / 100;
    let ui = "";
    if (template === "phone-post") {
      const headerH = u * 16;
      const imgY = s.y + u * 10 + headerH;
      const imgH = s.w;
      layers.push({ input: await rounded(image, s.w, imgH, 0, "cover"), left: Math.round(s.x), top: Math.round(imgY) });
      const ay = s.y + u * 10 + headerH / 2;
      ui += `<circle cx="${f(s.x + u * 9)}" cy="${f(ay)}" r="${f(u * 4.4)}" fill="${accent}"/>`;
      ui += bar(s.x + u * 16, ay - u * 2.6, u * 26, u * 2.4, "#1f2937") + bar(s.x + u * 16, ay + u * 0.8, u * 16, u * 2, "#d1d5db");
      const iy = imgY + imgH + u * 4;
      ui += icon(ICONS.heart, s.x + u * 4, iy, u * 7, "#111827") + icon(ICONS.comment, s.x + u * 14, iy, u * 7, "#111827");
      ui += icon(ICONS.send, s.x + u * 24, iy, u * 7, "#111827") + icon(ICONS.bookmark, s.x + s.w - u * 11, iy, u * 7, "#111827");
      const cy = iy + u * 12;
      ui += bar(s.x + u * 4, cy, u * 22, u * 2.4, "#1f2937") + bar(s.x + u * 4, cy + u * 5, u * 80, u * 2.2, "#d1d5db");
      ui += bar(s.x + u * 4, cy + u * 9.5, u * 64, u * 2.2, "#d1d5db") + bar(s.x + u * 4, cy + u * 14, u * 40, u * 2.2, "#e5e7eb");
      // status bar + island
      ui += `<rect x="${f(s.x + s.w / 2 - u * 15)}" y="${f(s.y + u * 2.5)}" width="${f(u * 30)}" height="${f(u * 7)}" rx="${f(u * 3.5)}" fill="#0b0b0d"/>`;
    } else {
      layers.push({ input: await rounded(image, s.w, s.h, s.r, "cover"), left: Math.round(s.x), top: Math.round(s.y) });
      const segs = 3;
      const gap = u * 1.5;
      const segW = (s.w - u * 8 - gap * (segs - 1)) / segs;
      for (let i = 0; i < segs; i++) {
        ui += `<rect x="${f(s.x + u * 4 + i * (segW + gap))}" y="${f(s.y + u * 13)}" width="${f(segW)}" height="${f(u * 0.9)}" rx="${f(u * 0.45)}" fill="#ffffff" opacity="${i === 0 ? 1 : 0.45}"/>`;
      }
      ui += `<circle cx="${f(s.x + u * 9)}" cy="${f(s.y + u * 21)}" r="${f(u * 4)}" fill="#ffffff" opacity="0.9"/>`;
      ui += bar(s.x + u * 15.5, s.y + u * 19.8, u * 24, u * 2.4, "#ffffff");
      ui += `<rect x="${f(s.x + u * 4)}" y="${f(s.y + s.h - u * 16)}" width="${f(s.w - u * 22)}" height="${f(u * 10)}" rx="${f(u * 5)}" fill="none" stroke="#ffffff" stroke-opacity="0.85" stroke-width="${f(u * 0.5)}"/>`;
      ui += icon(ICONS.heart, s.x + s.w - u * 14, s.y + s.h - u * 14.5, u * 7, "#ffffff");
      ui += `<rect x="${f(s.x + s.w / 2 - u * 15)}" y="${f(s.y + u * 2.5)}" width="${f(u * 30)}" height="${f(u * 7)}" rx="${f(u * 3.5)}" fill="#0b0b0d"/>`;
    }
    layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${ui}</svg>`) });
    return sharp(Buffer.from(back)).composite(layers).png().toBuffer();
  }

  if (template === "browser-pdp") {
    const W = 2400;
    const H = 1500;
    const bw = W * 0.86;
    const bh = H * 0.84;
    const bx = (W - bw) / 2;
    const by = (H - bh) / 2;
    const bar0 = bh * 0.065;
    const u = bw / 100;
    const imgS = bh - bar0 - u * 10;
    const imgX = bx + u * 4;
    const imgY = by + bar0 + u * 4;
    const mainW = imgS * 0.82;
    const thumbs = 4;
    const thumbS = (imgS - u * 1.5 * (thumbs - 1)) / thumbs;
    const colX = imgX + thumbS + u * 1.5 + mainW + u * 5;
    const colW = bx + bw - colX - u * 4;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bgA}"/><stop offset="1" stop-color="${bgB}"/></linearGradient>
<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${f(W * 0.012)}"/></filter></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<rect x="${f(bx)}" y="${f(by + bh * 0.02)}" width="${f(bw)}" height="${f(bh)}" rx="${f(u * 1.4)}" fill="#000" opacity="0.18" filter="url(#sh)"/>
<rect x="${f(bx)}" y="${f(by)}" width="${f(bw)}" height="${f(bh)}" rx="${f(u * 1.4)}" fill="#ffffff"/>
<path d="M ${f(bx)} ${f(by + bar0)} L ${f(bx)} ${f(by + u * 1.4)} Q ${f(bx)} ${f(by)} ${f(bx + u * 1.4)} ${f(by)} L ${f(bx + bw - u * 1.4)} ${f(by)} Q ${f(bx + bw)} ${f(by)} ${f(bx + bw)} ${f(by + u * 1.4)} L ${f(bx + bw)} ${f(by + bar0)} Z" fill="#f3f4f6"/>
<circle cx="${f(bx + u * 2)}" cy="${f(by + bar0 / 2)}" r="${f(u * 0.55)}" fill="#ff5f57"/><circle cx="${f(bx + u * 3.6)}" cy="${f(by + bar0 / 2)}" r="${f(u * 0.55)}" fill="#febc2e"/><circle cx="${f(bx + u * 5.2)}" cy="${f(by + bar0 / 2)}" r="${f(u * 0.55)}" fill="#28c840"/>
<rect x="${f(bx + bw * 0.3)}" y="${f(by + bar0 * 0.22)}" width="${f(bw * 0.4)}" height="${f(bar0 * 0.56)}" rx="${f(bar0 * 0.28)}" fill="#ffffff"/>
${bar(bx + bw * 0.33, by + bar0 * 0.43, bw * 0.16, bar0 * 0.14, "#d1d5db")}`;
    // right column: title, rating, price, text, swatches, buttons
    let y = imgY + u * 1;
    svg += bar(colX, y, colW * 0.35, u * 0.9, accent);
    y += u * 3;
    svg += bar(colX, y, colW * 0.92, u * 2.2, "#111827") + bar(colX, y + u * 3.2, colW * 0.6, u * 2.2, "#111827");
    y += u * 8.5;
    for (let i = 0; i < 5; i++) svg += icon(ICONS.star, colX + i * u * 2.4, y, u * 2, "#f59e0b", "#f59e0b");
    svg += bar(colX + u * 13, y + u * 0.6, u * 8, u * 0.9, "#d1d5db");
    y += u * 5.5;
    svg += bar(colX, y, colW * 0.28, u * 2.6, "#111827");
    y += u * 6;
    for (const w of [0.95, 0.88, 0.92, 0.6]) {
      svg += bar(colX, y, colW * w, u * 0.9, "#d1d5db");
      y += u * 2;
    }
    y += u * 2;
    (palette.length ? palette : ["#111827", "#9ca3af", "#e5e7eb"]).slice(0, 4).forEach((c, i) => {
      svg += `<circle cx="${f(colX + u * 1.6 + i * u * 4.2)}" cy="${f(y + u * 1.6)}" r="${f(u * 1.5)}" fill="${c}" stroke="${i === 0 ? "#111827" : "#e5e7eb"}" stroke-width="${f(u * 0.25)}"/>`;
    });
    y += u * 6.5;
    svg += `<rect x="${f(colX)}" y="${f(y)}" width="${f(colW)}" height="${f(u * 5)}" rx="${f(u * 1)}" fill="#111827"/>`;
    svg += bar(colX + colW / 2 - u * 6, y + u * 2.1, u * 12, u * 0.9, "#ffffff");
    y += u * 6.5;
    svg += `<rect x="${f(colX)}" y="${f(y)}" width="${f(colW)}" height="${f(u * 5)}" rx="${f(u * 1)}" fill="none" stroke="#d1d5db" stroke-width="${f(u * 0.2)}"/>`;
    svg += bar(colX + colW / 2 - u * 5, y + u * 2.1, u * 10, u * 0.9, "#6b7280");
    svg += `</svg>`;
    const layers: OverlayOptions[] = [];
    for (let i = 0; i < thumbs; i++) {
      layers.push({
        input: await rounded(image, thumbS, thumbS, u * 0.6, "contain"),
        left: Math.round(imgX),
        top: Math.round(imgY + i * (thumbS + u * 1.5)),
      });
    }
    layers.push({
      input: await rounded(image, mainW, imgS, u * 0.8, "contain"),
      left: Math.round(imgX + thumbS + u * 1.5),
      top: Math.round(imgY),
    });
    return sharp(Buffer.from(svg)).composite(layers).png().toBuffer();
  }

  // poster-frame
  const W = 1640;
  const H = 2048;
  const wall = mix(accent, "#f3efe9", 0.85);
  const fw = W * 0.56;
  const meta = await sharp(image).metadata();
  const ratio = (meta.height ?? 1) / (meta.width ?? 1);
  const innerW = fw * 0.78;
  const innerH = Math.min(H * 0.55, innerW * ratio);
  const fh = innerH + (fw - innerW);
  const fx = (W - fw) / 2;
  const fy = H * 0.42 - fh / 2;
  const border = fw * 0.035;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs><linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(wall, 0.05)}"/><stop offset="0.82" stop-color="${wall}"/><stop offset="0.82" stop-color="${shade(wall, -0.12)}"/><stop offset="1" stop-color="${shade(wall, -0.2)}"/></linearGradient>
<radialGradient id="l" cx="0.5" cy="0.3" r="0.7"><stop offset="0" stop-color="#fff" stop-opacity="0.5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${f(W * 0.014)}"/></filter></defs>
<rect width="${W}" height="${H}" fill="url(#w)"/><rect width="${W}" height="${H}" fill="url(#l)"/>
<rect x="${f(fx + W * 0.012)}" y="${f(fy + W * 0.03)}" width="${f(fw)}" height="${f(fh)}" fill="#000" opacity="0.3" filter="url(#sh)"/>
<rect x="${f(fx)}" y="${f(fy)}" width="${f(fw)}" height="${f(fh)}" fill="#1b1b1d"/>
<rect x="${f(fx + border)}" y="${f(fy + border)}" width="${f(fw - border * 2)}" height="${f(fh - border * 2)}" fill="#fbfaf8"/>
</svg>`;
  const inner = await sharp(image).resize(Math.round(innerW), Math.round(innerH), { fit: "cover" }).png().toBuffer();
  return sharp(Buffer.from(svg))
    .composite([{ input: inner, left: Math.round(fx + (fw - innerW) / 2), top: Math.round(fy + (fh - innerH) / 2) }])
    .png()
    .toBuffer();
}
