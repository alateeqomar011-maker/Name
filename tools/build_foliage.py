#!/usr/bin/env python3
"""Generates the photoreal foliage atlas used by every tree, bush and ground plant.

Layout matches flora.js TILES (4 columns x 3 rows):
  0 broadleaf cluster   1 jungle leaves      2 conifer branch (base left)  3 fern frond (base bottom)
  4 palm frond          5 hanging moss       6 needle tuft                 7 berry bush
  8 conifer spray       9 dense broadleaf    10 leafy twig (base bottom)   11 pine needle clump

Every leaf is rasterised individually at 2x resolution with its own outline (serrated or entire,
with a drip tip for tropical leaves), base-to-tip colour shift, midrib and secondary veins,
blemishes, cupped relief and depth darkening from draw order; needles and twigs are tapered
strokes. Outputs foliage_albedo.webp (RGBA, straight alpha) and foliage_normal.webp (OpenGL
convention for flipY textures).

usage: python3 -I tools/build_foliage.py <out-dir> [tile=512]
"""
import colorsys
import math
import os
import sys

import numpy as np
from PIL import Image

OUT = sys.argv[1]
T = int(sys.argv[2]) if len(sys.argv) > 2 else 512
SS = 2
S = T * SS  # supersampled tile size
rng = np.random.default_rng(1234)


def R(a, b):
    return a + (b - a) * rng.random()


def hsv(h, s, v):
    return np.array(colorsys.hsv_to_rgb(h / 360.0, s, v), np.float32)


class Tile:
    def __init__(self):
        self.col = np.zeros((S, S, 3), np.float32)
        self.a = np.zeros((S, S), np.float32)
        self.h = np.zeros((S, S), np.float32)  # relief height for the normal map
        self.depth = 0

    def over(self, x0, y0, col, alpha, hgt, shade):
        """composite a patch at integer offset (x0,y0)"""
        hh, ww = alpha.shape
        xa, ya = max(0, x0), max(0, y0)
        xb, yb = min(S, x0 + ww), min(S, y0 + hh)
        if xa >= xb or ya >= yb:
            return
        sx, sy = xa - x0, ya - y0
        a = alpha[sy:sy + yb - ya, sx:sx + xb - xa]
        c = col[sy:sy + yb - ya, sx:sx + xb - xa] * shade
        h = hgt[sy:sy + yb - ya, sx:sx + xb - xa]
        dst_a = self.a[ya:yb, xa:xb]
        # soft drop shadow cast onto what is already there (light from the upper left)
        self.shadow(x0, y0, alpha)
        sh = np.clip(a * 1.15, 0, 1) * 0.12
        self.col[ya:yb, xa:xb] *= (1 - sh[..., None])
        self.col[ya:yb, xa:xb] = c * a[..., None] + self.col[ya:yb, xa:xb] * (1 - a[..., None])
        self.h[ya:yb, xa:xb] = h * a + self.h[ya:yb, xa:xb] * (1 - a)
        self.a[ya:yb, xa:xb] = a + dst_a * (1 - a)


def box_blur(a, r):
    if r < 1:
        return a
    k = 2 * r + 1
    p = np.pad(a, r, mode='constant')
    c = np.cumsum(np.cumsum(p, 0), 1)
    c = np.pad(c, ((1, 0), (1, 0)))
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)


def _shadow(self, x0, y0, alpha, off=5 * SS, r=4 * SS, k=0.42):
    hh, ww = alpha.shape
    pad = r + off
    big = np.zeros((hh + 2 * pad, ww + 2 * pad), np.float32)
    big[pad + off:pad + off + hh, pad + off:pad + off + ww] = alpha
    sh = box_blur(box_blur(big, r // 2), r // 2) * k
    X0, Y0 = x0 - pad, y0 - pad
    xa, ya = max(0, X0), max(0, Y0)
    xb, yb = min(S, X0 + big.shape[1]), min(S, Y0 + big.shape[0])
    if xa >= xb or ya >= yb:
        return
    s = sh[ya - Y0:yb - Y0, xa - X0:xb - X0]
    # only darkens what is already painted
    self.col[ya:yb, xa:xb] *= (1 - s * np.clip(self.a[ya:yb, xa:xb] * 2, 0, 1))[..., None]


Tile.shadow = _shadow


def leaf(tile, x, y, length, width, ang, color, kind='ovate', serr=0.0, tip=0.0, veins=7, shade=1.0, glossy=False, bend=0.0, under=False, burn=0.0):
    """draw one leaf whose petiole is at (x,y) pointing along angle ang (radians, image space)"""
    L = length * SS
    Wd = width * SS
    pad = int(Wd + 4)
    n = int(L + 2 * pad)
    ys, xs = np.mgrid[0:n, 0:n].astype(np.float32)
    # local frame: u along the leaf (0 at petiole), v across
    cx = cy = n / 2
    dx, dy = xs - cx, ys - cy
    ca, sa = math.cos(ang), math.sin(ang)
    lu = (dx * ca + dy * sa) + L / 2
    lv = -dx * sa + dy * ca
    u = lu / L
    if bend:
        # curved midrib
        lv = lv - bend * L * 0.16 * np.clip(u, 0, 1) ** 2
    inside_u = (u >= 0) & (u <= 1)
    uc = np.clip(u, 0, 1)
    if kind == 'ovate':
        prof = np.maximum(np.sin(np.pi * uc ** 0.8), 0) ** 0.85
    elif kind == 'elliptic':
        prof = np.maximum(np.sin(np.pi * uc), 0) ** 0.7
    elif kind == 'lance':
        prof = np.maximum(np.sin(np.pi * uc ** 0.65), 0) ** 1.2
    elif kind == 'needle':
        prof = np.clip(1 - uc ** 4, 0, 1) ** 0.5
    else:
        prof = np.maximum(np.sin(np.pi * uc), 0)
    if tip > 0:
        # drip tip: the last part narrows into a long point
        prof *= 1 - tip * np.clip((uc - 0.72) / 0.28, 0, 1) ** 0.6 * 0.85
    half = Wd * prof
    if serr > 0:
        teeth = np.abs(((uc * (10 + length * 0.25)) % 1.0) - 0.5) * 2
        half = half * (1 - serr * teeth * (0.3 + 0.7 * np.sin(np.pi * uc)))
    d = np.abs(lv) - half
    alpha = np.clip(0.5 - d, 0, 1) * inside_u * np.clip(0.5 + np.minimum(lu, L - lu), 0, 1)
    if alpha.max() <= 0:
        return
    vn = np.clip(lv / np.maximum(half, 0.5), -1, 1)
    # colour: darker base, lighter mid, slightly yellower tip; paler midrib; vein network
    base = np.array(color, np.float32)
    g = 0.86 + 0.18 * np.sin(np.pi * uc) + 0.06 * uc
    col = base[None, None, :] * g[..., None]
    rib = np.clip(1 - np.abs(lv) / (1.1 * SS + Wd * 0.035), 0, 1) * (uc < 0.97)
    vein_ph = (uc * veins - np.abs(vn) * 0.9)
    vein = np.clip(1 - np.abs(((vein_ph % 1.0) - 0.5) * 2) * 6, 0, 1) * (np.abs(vn) > 0.08) * (np.abs(vn) < 0.92)
    lift = rib * 0.35 + vein * 0.12
    col = col * (1 + lift[..., None] * np.array([0.6, 0.5, 0.15]))
    # edge darkening, blemishes, fine cell noise
    col *= (1 - 0.18 * np.abs(vn) ** 3)[..., None]
    noise = rng.random((n, n)).astype(np.float32)
    col *= (0.94 + 0.12 * noise)[..., None]
    if rng.random() < 0.2:
        bx, by, br = R(0.3, 0.8), R(-0.6, 0.6), R(0.04, 0.12)
        spot = np.clip(1 - np.hypot(uc - bx, (vn - by) * 0.5) / br, 0, 1)
        col = col * (1 - spot[..., None] * 0.5) + spot[..., None] * np.array([0.25, 0.17, 0.06]) * 0.5
    if under:
        # leaf turned over: paler, waxy, bluish underside with a stronger rib
        col = col * 0.72 + np.array([0.11, 0.14, 0.1]) + rib[..., None] * 0.05
    if burn > 0:
        # sun-scorched, drying tip and margins
        bk = np.clip((uc - (1 - burn)) / max(burn, 1e-3), 0, 1) ** 1.5
        bk = np.maximum(bk, np.clip((np.abs(vn) - 0.9) * 10, 0, 1) * burn)
        col = col * (1 - bk[..., None]) + bk[..., None] * np.array([0.36, 0.27, 0.12]) * (0.8 + 0.4 * noise[..., None])
    # relief: cupped blade, raised midrib, grooved veins
    hgt = (1 - vn ** 2) * 0.6 + rib * 0.35 - vein * 0.08
    if glossy:
        col *= 0.95
    tile.over(int(x * SS + ca * L / 2 - n / 2), int(y * SS + sa * L / 2 - n / 2), col, alpha, hgt, shade)


def stroke(tile, x0, y0, x1, y1, w0, w1, color, shade=1.0, hscale=0.5):
    """tapered round stroke (twigs, rachis, needles) from (x0,y0) to (x1,y1) in tile pixels"""
    x0, y0, x1, y1 = x0 * SS, y0 * SS, x1 * SS, y1 * SS
    w0, w1 = w0 * SS * 0.5, w1 * SS * 0.5
    pad = int(max(w0, w1) + 3)
    xa, xb = int(min(x0, x1)) - pad, int(max(x0, x1)) + pad
    ya, yb = int(min(y0, y1)) - pad, int(max(y0, y1)) + pad
    ys, xs = np.mgrid[ya:yb, xa:xb].astype(np.float32)
    dx, dy = x1 - x0, y1 - y0
    L2 = max(dx * dx + dy * dy, 1e-6)
    t = np.clip(((xs - x0) * dx + (ys - y0) * dy) / L2, 0, 1)
    px, py = x0 + t * dx, y0 + t * dy
    d = np.hypot(xs - px, ys - py)
    w = w0 + (w1 - w0) * t
    alpha = np.clip(w - d + 0.5, 0, 1)
    if alpha.max() <= 0:
        return
    across = np.clip(d / np.maximum(w, 0.5), 0, 1)
    col = np.array(color, np.float32)[None, None, :] * (1 - 0.35 * across ** 2)[..., None]
    col *= (0.92 + 0.12 * rng.random(alpha.shape).astype(np.float32))[..., None]
    hgt = (1 - across ** 2) * hscale
    tile.over_px(xa, ya, col, alpha, hgt, shade) if hasattr(tile, 'over_px') else tile.over(xa, ya, col, alpha, hgt, shade)


def green(hue=(88, 118), sat=(0.45, 0.7), val=(0.22, 0.42)):
    return hsv(R(*hue), R(*sat), R(*val))


def leaf_xy(cx, cy, r, a):
    return cx + math.cos(a) * r, cy + math.sin(a) * r


# ------------------------------------------------------------------------- tile builders (coords in T px)
def broadleaf_cluster(tile, dense=False):
    """a branching sprig seen from above: forked twigs, alternate leaves of mixed size, some turned over"""
    twigs = []

    def grow(x, y, a, l, w, depth):
        ex, ey = x + math.cos(a) * l, y + math.sin(a) * l
        twigs.append((x, y, ex, ey, w, depth))
        if depth <= 0:
            return
        for k in range(2 if depth > 1 else 3):
            t = R(0.35, 0.95)
            bx, by = x + (ex - x) * t, y + (ey - y) * t
            grow(bx, by, a + (1 if k % 2 else -1) * R(0.35, 0.95), l * R(0.5, 0.72), w * 0.62, depth - 1)
        grow(ex, ey, a + R(-0.3, 0.3), l * R(0.45, 0.6), w * 0.7, depth - 1)

    base_n = 3 if not dense else 4
    for k in range(base_n):
        a = -math.pi / 2 + (k - (base_n - 1) / 2) * (R(0.45, 0.65) if not dense else R(0.3, 0.42)) + R(-0.15, 0.15)
        grow(T / 2 + R(-20, 20), T - 6, a, T * (R(0.3, 0.38) if not dense else R(0.25, 0.3)), 6.5, 3)
    for (x0, y0, x1, y1, w, d) in twigs:
        stroke(tile, x0, y0, x1, y1, w, max(0.9, w * 0.6), hsv(26, 0.4, 0.22 + 0.04 * d))
    order = []
    per = 3 if not dense else 4
    for (x0, y0, x1, y1, w, d) in twigs:
        if d > 1:
            continue
        L = math.hypot(x1 - x0, y1 - y0)
        n = max(2, int(L / (18 if not dense else 13)) * per // 3)
        a0 = math.atan2(y1 - y0, x1 - x0)
        for i in range(n):
            t = 0.2 + 0.8 * (i + R(0, 0.6)) / n
            side = 1 if i % 2 else -1
            x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            order.append((rng.random(), x, y, a0 + side * R(0.55, 1.1), t))
        order.append((rng.random(), x1, y1, a0 + R(-0.2, 0.2), 1.0))
    order.sort()
    for depth, x, y, a, t in order:
        sz = (R(30, 50) if not dense else R(22, 34)) * (0.75 + 0.35 * t)
        col = green((78, 112), (0.42, 0.72), (0.2, 0.44))
        if rng.random() < 0.12:
            col = hsv(R(55, 75), R(0.5, 0.7), R(0.3, 0.45))  # older yellowing leaf
        shade = 0.6 + 0.4 * depth
        leaf(tile, x, y, sz, sz * R(0.28, 0.38), a, col, 'ovate', serr=0.18 if not dense else 0.08, veins=7,
             shade=shade, bend=R(-0.5, 0.5), under=rng.random() < 0.16, burn=R(0.15, 0.35) if rng.random() < 0.06 else 0)


def jungle_leaves(tile):
    c = T / 2
    for k in range(7):
        a = (k / 7) * math.tau + R(-0.2, 0.2)
        stroke(tile, c, c, *leaf_xy(c, c, T * 0.3, a), 5, 2, hsv(70, 0.45, 0.3))
    order = sorted((rng.random(), (k / 30) * math.tau + R(-0.3, 0.3), R(0.04, 0.2) * T) for k in range(30))
    for depth, a, r in order:
        x, y = leaf_xy(c, c, r, a)
        ln = R(95, 135)
        col = green((95, 125), (0.55, 0.8), (0.18, 0.36))
        leaf(tile, x, y, ln, ln * R(0.22, 0.28), a + R(-0.5, 0.5), col, 'elliptic', tip=0.8, veins=11, shade=0.6 + 0.4 * depth, glossy=True)


def needles_on(tile, x0, y0, x1, y1, nl, dens, shade_base=1.0, hue=(115, 140)):
    L = math.hypot(x1 - x0, y1 - y0)
    steps = max(1, int(L / dens))
    a0 = math.atan2(y1 - y0, x1 - x0)
    for s in range(steps):
        t = s / steps
        x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        l = nl * (1 - t * 0.4)
        tipk = max(0.0, (t - 0.72) / 0.28)
        for side in (-1, 1):
            a = a0 + side * R(0.5, 1.05)
            col = hsv(R(*hue) - tipk * 28, R(0.35, 0.55) + tipk * 0.15, R(0.12, 0.24) + tipk * 0.16)
            stroke(tile, x, y, x + math.cos(a) * l, y + math.sin(a) * l, R(2.0, 2.8), 0.6, col, shade=shade_base * R(0.75, 1.0), hscale=0.3)


def conifer_branch(tile, vertical=False):
    # main axis
    if vertical:
        ax0, ay0, ax1, ay1 = T / 2, T - 4, T / 2, 10
    else:
        ax0, ay0, ax1, ay1 = 6, T / 2, T - 8, T / 2
    stroke(tile, ax0, ay0, ax1, ay1, 7, 2, hsv(26, 0.4, 0.2))
    nb = 10
    branches = []
    for k in range(nb):
        t = 0.08 + k * 0.088
        bx, by = ax0 + (ax1 - ax0) * t, ay0 + (ay1 - ay0) * t
        reach = math.sin(min(1.0, t * 1.25) * math.pi) * T * 0.36 * (1 - t * 0.3) + T * 0.05
        for side in (-1, 1):
            if vertical:
                ex, ey = bx + side * reach, by - reach * R(0.45, 0.7)
            else:
                ex, ey = bx + reach * R(0.45, 0.7), by + side * reach
            branches.append((rng.random(), bx, by, ex, ey))
    branches.sort()
    for depth, bx, by, ex, ey in branches:
        stroke(tile, bx, by, ex, ey, 3.2, 1.0, hsv(26, 0.38, 0.22), shade=0.7 + 0.3 * depth)
        needles_on(tile, bx, by, ex, ey, R(20, 28), 3.6, shade_base=0.62 + 0.38 * depth)
    needles_on(tile, ax0, ay0, ax1, ay1, 24, 3.8, shade_base=0.75)


def fern_frond(tile):
    cx = T / 2
    pts = [(cx + math.sin(t * 2.2) * 10, T - 4 - t * (T - 14)) for t in np.linspace(0, 1, 40)]
    for i in range(len(pts) - 1):
        stroke(tile, *pts[i], *pts[i + 1], 6 - 4 * i / len(pts), 5.6 - 4 * (i + 1) / len(pts), hsv(70, 0.45, 0.26))
    pinnae = []
    for i in range(3, len(pts) - 1, 2):
        t = i / len(pts)
        px, py = pts[i]
        reach = math.sin(min(1.0, t * 1.12) * math.pi) * T * 0.42 * (1 - t * 0.3) + 10
        for side in (-1, 1):
            if rng.random() < 0.06:
                continue  # a missing pinna
            pinnae.append((rng.random(), px, py, side, t, reach * R(0.85, 1.05)))
    pinnae.sort()
    for depth, px, py, side, t, reach in pinnae:
        ang = -math.pi / 2 + side * (1.1 - t * 0.4) + R(-0.06, 0.06)
        ex, ey = px + math.cos(ang) * reach, py + math.sin(ang) * reach
        stroke(tile, px, py, ex, ey, 2.4, 0.7, hsv(78, 0.45, 0.24), shade=0.7 + 0.3 * depth)
        n = max(3, int(reach / 11))
        col = green((86, 112), (0.5, 0.72), (0.22, 0.4))
        if t > 0.75:
            col = hsv(R(80, 95), R(0.55, 0.7), R(0.34, 0.46))  # fresh growth near the tip
        for j in range(n):
            u = (j + 0.5) / n
            qx, qy = px + (ex - px) * u, py + (ey - py) * u
            ln = (1 - u * 0.6) * R(13, 16)
            for s2 in (-1, 1):
                leaf(tile, qx, qy, ln, ln * 0.36, ang + s2 * R(1.0, 1.25), col * R(0.9, 1.08), 'lance', serr=0.15,
                     veins=3, shade=(0.62 + 0.38 * depth) * R(0.85, 1.0), burn=0.4 if rng.random() < 0.03 else 0)


def palm_frond(tile):
    cx = T / 2
    stroke(tile, cx, T - 2, cx, 4, 8, 2.5, hsv(52, 0.42, 0.34))
    order = []
    for y in np.arange(T - 10, 8, -11.0):
        t = 1 - y / T
        ln = (1 - t ** 1.6) * T * 0.46 + 18
        for side in (-1, 1):
            if rng.random() < 0.08:
                continue  # torn-out leaflet
            order.append((rng.random(), y + R(-2, 2), side, ln * R(0.85, 1.05)))
    order.sort()
    for depth, y, side, ln in order:
        ang = -math.pi / 2 + side * (math.pi / 2 - 0.5) + R(-0.07, 0.07)
        col = green((68, 98), (0.45, 0.68), (0.26, 0.44))
        leaf(tile, cx, y, ln, 5.0, ang, col, 'lance', veins=1, shade=0.68 + 0.32 * depth,
             bend=side * R(0.3, 0.7), burn=R(0.12, 0.3) if rng.random() < 0.3 else 0.04)


def hanging_moss(tile):
    for i in range(110):
        x = R(10, T - 10)
        ln = R(0.3, 0.98) * T
        col = hsv(R(70, 95), R(0.18, 0.32), R(0.3, 0.48))
        pts = [(x + math.sin(t * R(3, 6) + i) * R(4, 12), t * ln) for t in np.linspace(0, 1, 14)]
        for k in range(len(pts) - 1):
            stroke(tile, *pts[k], *pts[k + 1], R(2.0, 3.6), R(1.2, 2.6), col * R(0.8, 1.1), shade=R(0.7, 1.0), hscale=0.25)
            if rng.random() < 0.35:
                a = math.pi / 2 + R(-1.2, 1.2)
                stroke(tile, *pts[k], pts[k][0] + math.cos(a) * 9, pts[k][1] + math.sin(a) * 9, 1.6, 0.6, col, hscale=0.2)


def needle_tuft(tile, fan_up=False):
    c = T / 2
    n = 900
    for i in range(n):
        if fan_up:
            a = R(-math.pi * 0.95, -math.pi * 0.05)
            r0, r1 = R(0, 14), R(0.25, 0.47) * T
            x0, y0 = c + math.cos(a) * r0, T - 10 + math.sin(a) * r0
            x1, y1 = c + math.cos(a) * r1, T - 10 + math.sin(a) * r1 * 1.9
        else:
            a = R(0, math.tau)
            r0, r1 = R(0, 0.12) * T, R(0.24, 0.46) * T
            x0, y0 = c + math.cos(a) * r0, c + math.sin(a) * r0
            x1, y1 = c + math.cos(a) * r1, c + math.sin(a) * r1
        col = hsv(R(100, 135), R(0.3, 0.55), R(0.12, 0.3))
        stroke(tile, x0, y0, x1, y1, R(2.2, 3.2), 0.6, col, shade=R(0.6, 1.0), hscale=0.3)


def berry_bush(tile):
    broadleaf_cluster(tile, dense=True)
    c = T / 2
    bys, bxs = np.nonzero(tile.a[::SS, ::SS] > 0.9)
    for i in range(30):
        j = int(rng.integers(len(bxs)))
        bx, by = float(bxs[j]), float(bys[j])
        for k in range(4):
            x, y = bx + R(-9, 9), by + R(-9, 9)
            rad = R(4.5, 6.5) * SS
            n = int(rad * 2 + 4)
            ys, xs = np.mgrid[0:n, 0:n].astype(np.float32)
            d = np.hypot(xs - n / 2, ys - n / 2) / rad
            alpha = np.clip((1 - d) * rad, 0, 1)
            spec = np.clip(1 - np.hypot(xs - n / 2 + rad * 0.35, ys - n / 2 + rad * 0.35) / (rad * 0.35), 0, 1)
            col = np.array([0.45, 0.04, 0.08], np.float32)[None, None, :] * (1 - 0.5 * d[..., None] ** 2) + spec[..., None] * 0.5
            hgt = np.sqrt(np.clip(1 - d ** 2, 0, 1))
            tile.over(int(x * SS - n / 2), int(y * SS - n / 2), col, alpha, hgt, 1.0)


def leafy_twig(tile):
    cx = T / 2
    pts = [(cx + math.sin(t * 3) * 12, T - 4 - t * (T - 16)) for t in np.linspace(0, 1, 30)]
    for i in range(len(pts) - 1):
        stroke(tile, *pts[i], *pts[i + 1], 5 - 3 * i / len(pts), 5 - 3 * (i + 1) / len(pts), hsv(28, 0.42, 0.24))
    order = []
    for k in range(18):
        t = 0.1 + k * 0.05
        px, py = pts[int(t * (len(pts) - 1))]
        side = 1 if k % 2 else -1
        l = R(0.13, 0.26) * T * (1 - t * 0.35)
        ex, ey = px + side * l, py - l * 0.5
        stroke(tile, px, py, ex, ey, 2.4, 1.0, hsv(30, 0.4, 0.26))
        for q in range(5):
            u = 0.3 + q * 0.17
            order.append((rng.random(), px + (ex - px) * u, py + (ey - py) * u, math.atan2(ey - py, ex - px) + R(-0.9, 0.9)))
    order.sort()
    for depth, x, y, a in order:
        ln = R(30, 46)
        leaf(tile, x, y, ln, ln * 0.33, a, green((84, 112), (0.45, 0.7), (0.22, 0.42)), 'ovate', serr=0.15, shade=0.65 + 0.35 * depth)


BUILDERS = [
    lambda t: broadleaf_cluster(t), jungle_leaves, lambda t: conifer_branch(t, False), fern_frond,
    palm_frond, hanging_moss, lambda t: needle_tuft(t, False), berry_bush,
    lambda t: conifer_branch(t, True), lambda t: broadleaf_cluster(t, dense=True), leafy_twig, lambda t: needle_tuft(t, True),
]


def finish(tile):
    # downsample with premultiplied alpha, dilate colour into transparent texels (no dark fringes)
    col = tile.col * tile.a[..., None]
    a = tile.a
    h = tile.h
    def down(x):
        return x.reshape(T, SS, T, SS, *x.shape[2:]).mean(axis=(1, 3))
    ca, aa, ha = down(col), down(a), down(h * a) / np.maximum(down(a), 1e-4)
    rgb = ca / np.maximum(aa[..., None], 1e-4)
    # colour bleed for transparent texels: average of opaque neighbours, iterated
    filled = rgb.copy()
    w = (aa > 0.02).astype(np.float32)
    for _ in range(12):
        nb = np.zeros_like(filled)
        nw = np.zeros_like(w)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                nb += np.roll(np.roll(filled * w[..., None], dy, 0), dx, 1)
                nw += np.roll(np.roll(w, dy, 0), dx, 1)
        grow = (w == 0) & (nw > 0)
        filled[grow] = nb[grow] / nw[grow][..., None]
        w = np.maximum(w, grow.astype(np.float32))
    mean = rgb[aa > 0.5].mean(axis=0) if (aa > 0.5).any() else np.array([0.2, 0.3, 0.1])
    filled[w == 0] = mean
    # normal map from relief (GL convention for a flipY texture: +y = up in the image)
    hb = ha * (aa > 0.02)
    gx = (np.roll(hb, -1, 1) - np.roll(hb, 1, 1)) * 0.5
    gy = (np.roll(hb, -1, 0) - np.roll(hb, 1, 0)) * 0.5
    k = 2.2
    n = np.stack([-gx * k, gy * k, np.ones_like(hb)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return np.clip(filled, 0, 1), np.clip(aa, 0, 1), n


atlas = np.zeros((3 * T, 4 * T, 4), np.float32)
natlas = np.zeros((3 * T, 4 * T, 3), np.float32)
for i, build in enumerate(BUILDERS):
    tile = Tile()
    build(tile)
    rgb, a, n = finish(tile)
    # keep a clean transparent border so mipmaps never bleed between tiles
    edge = np.minimum(np.minimum(np.arange(T), np.arange(T)[::-1]), 999).astype(np.float32)
    fade = np.clip((edge - 3) / 6, 0, 1)
    a = a * fade[None, :] * fade[:, None]
    tx, ty = i % 4, i // 4
    atlas[ty * T:(ty + 1) * T, tx * T:(tx + 1) * T, :3] = rgb
    atlas[ty * T:(ty + 1) * T, tx * T:(tx + 1) * T, 3] = a
    natlas[ty * T:(ty + 1) * T, tx * T:(tx + 1) * T] = n * 0.5 + 0.5
    print('tile', i, 'coverage', round(float(a.mean()), 3))

os.makedirs(OUT, exist_ok=True)
# lossy colour with lossless alpha keeps the leaf outlines exact at a fraction of the PNG size
Image.fromarray((atlas * 255 + 0.5).astype(np.uint8), 'RGBA').save(os.path.join(OUT, 'foliage_albedo.webp'), quality=92, method=6)
Image.fromarray((natlas * 255 + 0.5).astype(np.uint8), 'RGB').save(os.path.join(OUT, 'foliage_normal.webp'), quality=92, method=6)
print('wrote', OUT)
