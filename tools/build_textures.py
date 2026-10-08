#!/usr/bin/env python3
"""Builds the photo-scanned terrain material arrays used by the terrain shader.

Inputs are CC0 / MIT photo-scanned PBR sets (see public/textures/CREDITS.md). For every layer we
produce a 1024px albedo (ambient occlusion lightly baked in) and a 512px data map holding the
tangent-space normal (xy, "rows go down" convention, so +y means the surface rises toward the
next row) and a normalised height (b) used for height-based blending. The layers are stacked
vertically into two strips that the game uploads as WebGL2 texture arrays.

usage: python3 -I tools/build_textures.py <source-dir> <out-dir>
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFile

ImageFile.MAXBLOCK = 1 << 26

SRC, OUT = sys.argv[1], sys.argv[2]
A_SIZE, N_SIZE = 1024, 512

J = 'jMonke__Textures_Terrain_PBR_'
# name, albedo, normal, height, ao, options
LAYERS = [
    ('grass',       'Grass001_1K_Color.jpg', 'Grass001_1K_Normal.jpg', 'Grass001_1K_Displacement.jpg', 'Grass001_1K_AmbientOcclusion.jpg', {}),
    ('grassdry',    J + 'Ground037_1K_Color.png', J + 'Ground037_1K_Normal.png', J + 'Ground037_1K_Displacement.png', J + 'Ground037_1K_AmbientOcclusion.png', {}),
    ('soil',        J + 'Ground036_1K_Color.png', J + 'Ground036_1K_Normal.png', J + 'Ground036_1K_Displacement.png', J + 'Ground036_1K_AmbientOcclusion.png', {}),
    ('gravel',      J + 'Gravel015_1K_Color.png', J + 'Gravel015_1K_Normal.png', J + 'Gravel015_1K_Displacement.png', J + 'Gravel015_1K_AmbientOcclusion.png', {}),
    ('trail',       'playca__rocky_trail_diff_1k.jpg', None, None, None, {'slope': 0.26}),
    ('cracked',     'playca__rock_boulder_cracked_diff_1k.jpg', None, None, None, {'slope': 0.24, 'invert_h': True}),
    ('sand',        'godot_sand_albedo.jpg', 'godot_sand_normal.jpg', None, None, {'despot': True}),
    ('dune',        'playca__ground092c_color.webp', 'playca__ground092c_normal.webp', 'playca__ground092c_height.webp', 'playca__ground092c_ao.webp', {'contrast': 0.45}),
    ('snow',        J + 'Snow006_1K_Color.png', J + 'Snow006_1K_Normal.png', J + 'Snow006_1K_Displacement.png', J + 'Snow006_1K_AmbientOcclusion.png', {}),
    ('rock',        'Rock020_1K_Color.jpg', 'Rock020_1K_Normal.jpg', 'Rock020_1K_Displacement.jpg', 'Rock020_1K_AmbientOcclusion.jpg', {}),
    ('mossrock',    'playca__aerial_rocks_02_diff_1k.jpg', None, None, None, {'slope': 0.32}),
    ('sandstone',   'godot_rock_albedo.jpg', None, 'godot_rock_depth.jpg', None, {'slope': 0.3, 'invert_h': True}),
    ('basalt',      J + 'Rock035_1K_Color.png', J + 'Rock035_1K_Normal.png', J + 'Rock035_1K_Displacement.png', J + 'Rock035_1K_AmbientOcclusion.png', {'basalt': True}),
    ('coastrock',   'playca__seaside-rocks01-color.jpg', 'playca__seaside-rocks01-normal.jpg', 'playca__seaside-rocks01-height.jpg', 'playca__seaside-rocks01-ao.jpg', {}),
    ('mossground',  'playca__coast_sand_rocks_02_diff_1k.jpg', None, None, None, {'slope': 0.26}),
]


def load(name, size, mode='RGB'):
    im = Image.open(os.path.join(SRC, name))
    if im.mode in ('I;16', 'I;16B', 'I', 'F'):
        # 16-bit greyscale (displacement maps): keep the precision
        a = np.asarray(im).astype(np.float32)
        a = a / (65535.0 if a.max() > 255 else 255.0)
        if mode == 'RGB':
            a = np.stack([a] * 3, -1)
        if a.shape[0] != size:
            ch = [np.asarray(Image.fromarray(a[..., i] if a.ndim == 3 else a).resize((size, size), Image.LANCZOS)) for i in range(a.shape[-1] if a.ndim == 3 else 1)]
            a = np.stack(ch, -1) if a.ndim == 3 else ch[0]
        return a.astype(np.float32)
    im = im.convert(mode)
    if im.size != (size, size):
        im = im.resize((size, size), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255.0


def blur(a, r):
    """separable box blur (3 passes ~ gaussian), wraps around (the sources tile)"""
    for _ in range(3):
        acc = np.zeros_like(a)
        for d in range(-r, r + 1):
            acc += np.roll(a, d, axis=0)
        a = acc / (2 * r + 1)
        acc = np.zeros_like(a)
        for d in range(-r, r + 1):
            acc += np.roll(a, d, axis=1)
        a = acc / (2 * r + 1)
    return a


def norm01(a, lo=1, hi=99):
    p0, p1 = np.percentile(a, lo), np.percentile(a, hi)
    return np.clip((a - p0) / max(p1 - p0, 1e-6), 0, 1)


def lum(rgb):
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def grad(h):
    gx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 0.5
    gy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * 0.5
    return gx, gy


def height_from_albedo(rgb, size):
    l = lum(rgb)
    # large shapes from a blurred copy, fine grain from the high-pass remainder
    low = blur(l, max(2, size // 128))
    hp = l - blur(l, max(4, size // 24))
    return norm01(low * 0.6 + hp * 1.4 + l * 0.3)


def normal_from_height(h, target):
    # scale the gradient so the mean surface tilt matches a typical scanned normal map
    gx, gy = grad(blur(h, 1))
    mag = np.sqrt(gx * gx + gy * gy)
    lo, hi = 0.01, 1000.0
    for _ in range(40):
        k = (lo * hi) ** 0.5
        t = np.mean(k * mag / np.sqrt(1 + (k * mag) ** 2))
        lo, hi = (k, hi) if t < target else (lo, k)
    k = (lo * hi) ** 0.5
    n = np.stack([-gx * k, -gy * k, np.ones_like(h)], -1)
    return n / np.linalg.norm(n, axis=-1, keepdims=True)


report = {}
albedo_strip = []
data_strip = []
for name, a_f, n_f, h_f, ao_f, opt in LAYERS:
    rgb = load(a_f, A_SIZE)
    if opt.get('despot'):
        # the source sand has a few flat grey wet blotches that would tile visibly: patch them
        # with clean sand copied from elsewhere in the same (tileable) image
        mx, mn = rgb.max(-1), rgb.min(-1)
        sat = (mx - mn) / np.maximum(mx, 1e-3)
        spot = np.clip((0.168 - blur(sat, 3)) / 0.02, 0, 1)
        spot = np.clip(blur(spot, 10) * 3.0, 0, 1)
        out = rgb.copy()
        cover = np.zeros_like(spot)
        for off in [(311, 517), (-401, 233), (157, -389), (509, 509)]:
            src = np.roll(rgb, off, (0, 1))
            ok = 1 - np.clip(np.roll(spot, off, (0, 1)) * 4, 0, 1)
            take = spot * ok * (1 - cover)
            out = out * (1 - take[..., None]) + src * take[..., None]
            cover = np.clip(cover + take, 0, 1)
        rgb = out
    if opt.get('contrast'):
        m = rgb.mean(axis=(0, 1), keepdims=True)
        rgb = m + (rgb - m) * opt['contrast']
    if opt.get('basalt'):
        # Rock035 is a blue-grey stone: turn it into dark, slightly warm volcanic basalt
        l = lum(rgb)[..., None]
        rgb = np.clip(l * np.array([0.62, 0.58, 0.56]) * 1.05 + (rgb - l) * 0.15, 0, 1)
    # height
    hsmall = None
    if h_f:
        h = load(h_f, N_SIZE, 'L')
        if opt.get('invert_h'):
            h = 1 - h
        h = norm01(h)
    else:
        h = height_from_albedo(load(a_f, N_SIZE), N_SIZE)
        if opt.get('invert_h'):
            h = 1 - h
    # normal
    if n_f:
        nm = load(n_f, N_SIZE) * 2 - 1
        hh = blur(h, 1)
        gx, gy = grad(hh)
        cx = np.corrcoef(nm[..., 0].ravel(), gx.ravel())[0, 1]
        cy = np.corrcoef(nm[..., 1].ravel(), gy.ravel())[0, 1]
        # target convention: n.x = -dh/dcol, n.y = -dh/drow
        if cx > 0:
            nm[..., 0] *= -1
        if cy > 0:
            nm[..., 1] *= -1
        nm[..., 2] = np.sqrt(np.clip(1 - nm[..., 0] ** 2 - nm[..., 1] ** 2, 0, 1))
        conv = ('flipX ' if cx > 0 else '') + ('flipY' if cy > 0 else '')
        n = nm
    else:
        n = normal_from_height(h, opt.get('slope', 0.28))
        cx = cy = 0
        conv = 'derived'
    # ambient occlusion: from the map, or a cavity term from the height
    if ao_f:
        ao = load(ao_f, A_SIZE, 'L')
    else:
        hb = np.asarray(Image.fromarray((h * 255).astype(np.uint8)).resize((A_SIZE, A_SIZE), Image.BILINEAR)).astype(np.float32) / 255
        ao = np.clip(1 - (blur(hb, 6) - hb) * 2.2, 0.55, 1)
    rgb = rgb * (0.35 + 0.65 * ao[..., None] ** 0.8)
    mean = rgb.reshape(-1, 3).mean(0)
    slope = float(np.mean(np.sqrt(n[..., 0] ** 2 + n[..., 1] ** 2)))
    report[name] = {'mean': [round(float(m), 4) for m in mean], 'slope': round(slope, 3), 'normal': conv, 'cx': round(float(cx), 2), 'cy': round(float(cy), 2)}
    print(f'{name:11s} mean={report[name]["mean"]} slope={slope:.3f} normal={conv} ({cx:+.2f},{cy:+.2f})')
    albedo_strip.append((np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8))
    data = np.stack([n[..., 0] * 0.5 + 0.5, n[..., 1] * 0.5 + 0.5, h], -1)
    data_strip.append((np.clip(data, 0, 1) * 255 + 0.5).astype(np.uint8))

os.makedirs(OUT, exist_ok=True)
Image.fromarray(np.concatenate(albedo_strip, 0)).save(os.path.join(OUT, 'terrain_albedo.jpg'), quality=84)
Image.fromarray(np.concatenate(data_strip, 0)).save(os.path.join(OUT, 'terrain_data.jpg'), quality=90, subsampling=0)
with open(os.path.join(OUT, 'terrain_layers.json'), 'w') as f:
    json.dump({'layers': [l[0] for l in LAYERS], 'albedoSize': A_SIZE, 'dataSize': N_SIZE, 'info': report}, f, indent=1)
print('wrote', OUT)

# ---- tree bark (separate 2D textures for the trunk material, OpenGL normal convention) ----
BARK_A, BARK_N = 'jMonke__Models_Tree_BarkColor.jpg', 'jMonke__Models_Tree_BarkNormal.jpg'
if os.path.exists(os.path.join(SRC, BARK_A)):
    S = 512
    rgb = load(BARK_A, S)
    nm = load(BARK_N, S) * 2 - 1
    # dark furrows are low: use the albedo as a height proxy to detect the normal convention
    hh = blur(lum(rgb), 2)
    gx, gy = grad(hh)
    cx = np.corrcoef(nm[..., 0].ravel(), gx.ravel())[0, 1]
    cy = np.corrcoef(nm[..., 1].ravel(), gy.ravel())[0, 1]
    # OpenGL: n.x = -dh/dcol, n.y = +dh/drow (image rows go down, texture v goes up)
    if cx > 0:
        nm[..., 0] *= -1
    if cy < 0:
        nm[..., 1] *= -1
    # deepen the furrows a little and add a cavity term to the albedo
    cav = np.clip(1 - (blur(hh, 5) - hh) * 3.0, 0.5, 1)
    rgb = rgb * cav[..., None]
    print(f'bark normal corr ({cx:+.2f},{cy:+.2f})')
    Image.fromarray((np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, 'bark_albedo.jpg'), quality=88)
    Image.fromarray((np.clip(nm * 0.5 + 0.5, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, 'bark_normal.jpg'), quality=90, subsampling=0)
