#!/usr/bin/env python3
"""Generates the tileable reptile-skin detail texture used by the dinosaur skin shader.

skin_nh.jpg (rgb): tangent normal x, y ("rows go down" convention) and height.
skin_ao.jpg (rgb): crevice occlusion, per-scale tint variation, tubercle mask.

Pebbly scales come from a jittered-grid Voronoi pattern on a torus (so the result tiles); larger
raised tubercles are scattered over it, and fine wrinkles cross the whole surface.
usage: python3 -I tools/build_skin.py <out-dir>
"""
import sys

import numpy as np
from PIL import Image

S = 512
rng = np.random.default_rng(7)
yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)


def voronoi(cell, jitter=0.8):
    n = S // cell
    seeds = (rng.random((n, n, 2)) - 0.5) * jitter + 0.5
    gx, gy = np.floor(xx / cell).astype(int), np.floor(yy / cell).astype(int)
    f1 = np.full((S, S), 1e9, np.float32)
    f2 = np.full((S, S), 1e9, np.float32)
    idx = np.zeros((S, S), np.int32)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            cx, cy = (gx + dx) % n, (gy + dy) % n
            sx = (gx + dx + seeds[cy, cx, 0]) * cell
            sy = (gy + dy + seeds[cy, cx, 1]) * cell
            d = np.sqrt((xx + 0.5 - sx) ** 2 + (yy + 0.5 - sy) ** 2)
            closer = d < f1
            f2 = np.where(closer, f1, np.minimum(f2, d))
            idx = np.where(closer, cy * n + cx, idx)
            f1 = np.where(closer, d, f1)
    return f1, f2, idx


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def blur(a, r):
    for _ in range(2):
        acc = sum(np.roll(a, d, 0) for d in range(-r, r + 1)) / (2 * r + 1)
        a = sum(np.roll(acc, d, 1) for d in range(-r, r + 1)) / (2 * r + 1)
    return a


def tnoise(freq, seed):
    # tileable value noise from a random grid upsampled with wrap-around
    r = np.random.default_rng(seed).random((freq, freq)).astype(np.float32)
    big = np.tile(r, (3, 3))
    im = Image.fromarray(big).resize((S * 3, S * 3), Image.BICUBIC)
    return np.asarray(im)[S:2 * S, S:2 * S]


# small pebbly scales (~16 px)
c = 16
f1, f2, idx = voronoi(c)
edge = f2 - f1
dome = np.clip(1 - (f1 / (c * 0.72)) ** 2, 0, 1)
h = np.sqrt(smooth(0.0, c * 0.32, edge)) * (0.55 + 0.45 * dome)
tint = (np.random.default_rng(3).random(idx.max() + 1)[idx] - 0.5).astype(np.float32)
# larger raised tubercles (osteoderm-like) in loose clusters
c2 = 64
g1, g2, gid = voronoi(c2, 0.6)
present = np.random.default_rng(5).random(gid.max() + 1)[gid] < 0.3
rad = (0.2 + 0.13 * np.random.default_rng(9).random(gid.max() + 1)[gid]) * c2 * (0.82 + 0.36 * tnoise(40, 21))
tub = present & (g1 < rad)
tdome = np.clip(1 - (g1 / rad) ** 2, 0, 1) ** 0.65 * (0.8 + 0.4 * tnoise(96, 23))
ring = present & (g1 >= rad) & (g1 < rad + 2.5)
h = np.where(tub, 0.35 + 0.95 * tdome, h)
h = np.where(ring, h * 0.15, h)
tub_mask = np.where(tub, tdome, 0).astype(np.float32)
# fine wrinkles running across the scales and micro grain
wr = tnoise(6, 11) * 6.0
wrinkle = np.abs(np.sin((yy / S * 18 + wr) * np.pi))
h -= (1 - smooth(0.0, 0.12, wrinkle)) * 0.25 * (1 - tub_mask)
h += (tnoise(64, 13) - 0.5) * 0.08 + (tnoise(128, 17) - 0.5) * 0.05
h = (h - h.min()) / (h.max() - h.min())
# normal from height ("rows go down": n.y = -dh/drow)
hb = blur(h, 1)
gx = (np.roll(hb, -1, 1) - np.roll(hb, 1, 1)) * 0.5
gy = (np.roll(hb, -1, 0) - np.roll(hb, 1, 0)) * 0.5
k = 9.0
n = np.stack([-gx * k, -gy * k, np.ones_like(h)], -1)
n /= np.linalg.norm(n, axis=-1, keepdims=True)
# crevice occlusion
ao = np.clip(1 - (blur(h, 4) - h) * 2.4, 0, 1)
top = np.stack([n[..., 0] * 0.5 + 0.5, n[..., 1] * 0.5 + 0.5, h], -1)
bot = np.stack([ao, tint + 0.5, tub_mask], -1)
out = sys.argv[1]
for arr, name in ((top, 'skin_nh.jpg'), (bot, 'skin_ao.jpg')):
    Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)).save(out + '/' + name, quality=92, subsampling=0)
print('wrote', out, 'slope', float(np.mean(np.sqrt(n[..., 0] ** 2 + n[..., 1] ** 2))))
