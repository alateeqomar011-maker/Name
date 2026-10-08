#!/usr/bin/env python3
"""Generates the animated ocean detail and the foam texture used by the water shader.

water_normal.jpg  vertical strip of F frames (S x S each) of a looping FFT ocean (Tessendorf):
                  Phillips spectrum, dispersion quantised to the loop period so the last frame
                  flows into the first. RGB = surface slope x, slope z (0.5 = flat), whitecap
                  coverage from the Jacobian of the choppy displacement.
water_foam.jpg    tileable aerated-foam pattern: clustered bubbles of many sizes, lacy holes and
                  streaks, the way surf foam breaks up as it drains.

usage: python3 -I tools/build_water.py <out-dir> [size=256] [frames=24]
"""
import math
import os
import sys

import numpy as np
from PIL import Image

OUT = sys.argv[1]
M = int(sys.argv[2]) if len(sys.argv) > 2 else 256
F = int(sys.argv[3]) if len(sys.argv) > 3 else 24
L = 48.0          # patch size in metres
T = 6.0           # loop period in seconds
WIND = 9.0        # m/s
WDIR = np.array([0.86, 0.5])
G = 9.81
CHOP = 1.25
rng = np.random.default_rng(7)

n = np.fft.fftfreq(M, 1.0 / M)  # 0,1,..,M/2-1,-M/2..-1
kx, kz = np.meshgrid(2 * np.pi * n / L, 2 * np.pi * n / L)
k = np.hypot(kx, kz)
k[0, 0] = 1e-6
Lw = WIND * WIND / G
kh = np.stack([kx / k, kz / k], -1)
cosw = kh[..., 0] * WDIR[0] + kh[..., 1] * WDIR[1]
P = np.exp(-1.0 / (k * Lw) ** 2) / k ** 4 * np.abs(cosw) ** 4
P *= np.exp(-(k * 0.09) ** 2)            # damp the tiniest ripples (they alias)
P[cosw < 0] *= 0.12                       # waves travelling against the wind are weak
P[0, 0] = 0
A = 2.2e-3
h0 = (rng.standard_normal((M, M)) + 1j * rng.standard_normal((M, M))) * np.sqrt(P * A / 2)
# h0(-k): index mirror
mi = (-np.arange(M)) % M
h0m = np.conj(h0[np.ix_(mi, mi)])
# calibrate the amplitude: rms surface slope of a fresh breeze sea (~0.13)
s0x = np.real(np.fft.ifft2(1j * kx * (h0 + h0m)))
s0z = np.real(np.fft.ifft2(1j * kz * (h0 + h0m)))
rms = math.sqrt(float(np.mean(s0x ** 2 + s0z ** 2)))
h0 *= 0.13 / rms
h0m *= 0.13 / rms
w0 = 2 * np.pi / T
omega = np.floor(np.sqrt(G * k) / w0) * w0

frames = []
for f in range(F):
    t = f * T / F
    e = np.exp(1j * omega * t)
    hk = h0 * e + h0m * np.conj(e)
    # slopes and choppy displacement derivatives
    sx = np.real(np.fft.ifft2(1j * kx * hk))
    sz = np.real(np.fft.ifft2(1j * kz * hk))
    dxx = np.real(np.fft.ifft2(-(kx * kx / k) * hk))   # d(Dx)/dx with Dx = -i kx/k h
    dzz = np.real(np.fft.ifft2(-(kz * kz / k) * hk))
    dxz = np.real(np.fft.ifft2(-(kx * kz / k) * hk))
    J = (1 + CHOP * dxx) * (1 + CHOP * dzz) - (CHOP * dxz) ** 2
    frames.append((sx, sz, J))

smax = max(np.percentile(np.abs(np.stack([fr[0] for fr in frames] + [fr[1] for fr in frames])), 99.7), 1e-4)
print('slope scale', smax)
strip = np.zeros((M * F, M, 3), np.float32)
for f, (sx, sz, J) in enumerate(frames):
    foam = np.clip((0.95 - J) / 0.55, 0, 1) ** 0.8
    strip[f * M:(f + 1) * M, :, 0] = np.clip(sx / smax * 0.5 + 0.5, 0, 1)
    strip[f * M:(f + 1) * M, :, 1] = np.clip(sz / smax * 0.5 + 0.5, 0, 1)
    strip[f * M:(f + 1) * M, :, 2] = foam
os.makedirs(OUT, exist_ok=True)
Image.fromarray((strip * 255 + 0.5).astype(np.uint8), 'RGB').save(
    os.path.join(OUT, 'water_normal.jpg'), quality=94, subsampling=0)
print('normal strip', strip.shape, 'slope scale (store in shader):', round(float(smax), 4))

# ---------------------------------------------------------------- foam
S = 512
foam = np.zeros((S, S), np.float32)


def tile_disc(img, cx, cy, r, val, soft=1.5, ring=False):
    x0, x1 = int(cx - r - 3), int(cx + r + 4)
    y0, y1 = int(cy - r - 3), int(cy + r + 4)
    ys, xs = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    d = np.hypot(xs - cx, ys - cy)
    if ring:
        a = np.clip(1 - np.abs(d - r * 0.82) / (r * 0.22 + soft), 0, 1)
    else:
        a = np.clip((r - d) / soft, 0, 1)
    yi, xi = ys.astype(int) % S, xs.astype(int) % S
    np.maximum.at(img, (yi, xi), a * val)


def blur_wrap(a, r):
    k = 2 * r + 1
    out = a.copy()
    for ax in (0, 1):
        c = np.cumsum(np.concatenate([out.take(range(-r - 1, 0), axis=ax), out, out.take(range(0, r), axis=ax)], axis=ax), axis=ax)
        sl1 = [slice(None)] * 2
        sl0 = [slice(None)] * 2
        sl1[ax] = slice(k, k + S)
        sl0[ax] = slice(0, S)
        out = (c[tuple(sl1)] - c[tuple(sl0)]) / k
    return out


# large-scale lacy structure: thresholded multi-octave noise (tileable via FFT-filtered white noise)
def tile_noise(scale):
    wn = rng.standard_normal((S, S))
    fx = np.fft.fftfreq(S)
    fk = np.hypot(*np.meshgrid(fx, fx))
    spec = np.fft.fft2(wn) * np.exp(-(fk * S / scale) ** 2)
    v = np.real(np.fft.ifft2(spec))
    return (v - v.mean()) / (v.std() + 1e-6)


def worley_walls(cells, width):
    """tileable Voronoi bubble walls: 1 on the thin films between neighbouring bubbles"""
    pts = rng.random((cells, cells, 2))
    ys, xs = np.mgrid[0:S, 0:S].astype(np.float32)
    gx, gy = xs / S * cells, ys / S * cells
    cx, cy = np.floor(gx).astype(int), np.floor(gy).astype(int)
    f1 = np.full((S, S), 9.0, np.float32)
    f2 = np.full((S, S), 9.0, np.float32)
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            nx, ny = cx + ox, cy + oy
            p = pts[ny % cells, nx % cells]
            d = np.hypot(nx + p[..., 0] - gx, ny + p[..., 1] - gy)
            f2 = np.where(d < f1, f1, np.minimum(f2, d))
            f1 = np.minimum(f1, d)
    e = f2 - f1
    return np.clip(1 - e / width, 0, 1) ** 1.5, f1


lace = tile_noise(14) * 0.7 + tile_noise(40) * 0.3
# where the foam blanket is: thick patches, thinning lace, open water in the holes
cover = np.clip((lace + 0.35) * 1.1, 0, 1)
w_small, f_small = worley_walls(56, 0.16)
w_mid, _ = worley_walls(22, 0.12)
w_big, _ = worley_walls(9, 0.07)
# small bubbles fill the thick parts, bigger cells appear as the foam drains and thins
thin = np.clip(1 - cover * 1.4, 0, 1)
walls = np.maximum(w_small * (0.55 + 0.45 * cover), np.maximum(w_mid * (0.5 + 0.5 * thin), w_big * thin))
# bubble caps catch light: a soft bright dome inside each small cell
domes = np.clip(1 - f_small * 1.6, 0, 1) ** 2 * 0.35
foam = (walls * 0.85 + domes + cover * 0.25) * cover
holes = np.clip((tile_noise(9) - 0.6) * 1.8, 0, 1)
foam *= 1 - holes * 0.8
foam = blur_wrap(foam, 1) * 0.5 + foam * 0.5
foam = np.clip(foam / np.percentile(foam, 99.5), 0, 1)
Image.fromarray((foam * 255 + 0.5).astype(np.uint8), 'L').convert('RGB').save(os.path.join(OUT, 'water_foam.jpg'), quality=92)
print('foam coverage', round(float(foam.mean()), 3))
