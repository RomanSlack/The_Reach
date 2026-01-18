#!/usr/bin/env python3
"""
Binary cloud silhouettes (black/white) using thresholded fractal Perlin noise.

Outputs a PNG where white regions look like cloud blobs on a black background.

Requires: numpy, pillow
  pip install numpy pillow
"""

from __future__ import annotations
import math
import argparse
import numpy as np
from PIL import Image, ImageFilter
import os


def fade(t: np.ndarray) -> np.ndarray:
    # Perlin fade curve: 6t^5 - 15t^4 + 10t^3
    return t * t * t * (t * (t * 6 - 15) + 10)


def lerp(a: np.ndarray, b: np.ndarray, t: np.ndarray) -> np.ndarray:
    return a + t * (b - a)


def perlin2d(width: int, height: int, scale: float, seed: int, tileable: bool = False) -> np.ndarray:
    """
    2D Perlin noise in [0, 1], roughly.
    scale: higher -> larger features (because we sample fewer grid cells).
    tileable: if True, the noise will tile seamlessly.
    """
    if scale <= 0:
        raise ValueError("scale must be > 0")

    rng = np.random.default_rng(seed)

    if tileable:
        # For tileable noise, we need an integer number of cells that wrap
        grid_w = max(1, int(round(width / scale)))
        grid_h = max(1, int(round(height / scale)))

        # Coordinate grid spans exactly grid_w x grid_h cells
        xs = np.linspace(0, grid_w, width, endpoint=False)
        ys = np.linspace(0, grid_h, height, endpoint=False)
        x, y = np.meshgrid(xs, ys)

        x0 = np.floor(x).astype(int)
        y0 = np.floor(y).astype(int)
        x1 = x0 + 1
        y1 = y0 + 1

        # Local coordinates within each cell
        sx = x - x0
        sy = y - y0

        # Generate gradient grid (will wrap via modulo)
        angles = rng.uniform(0.0, 2.0 * math.pi, size=(grid_h, grid_w))
        grads = np.dstack((np.cos(angles), np.sin(angles)))  # (gy, gx, 2)

        def grad_at(ix: np.ndarray, iy: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
            # Wrap coordinates for seamless tiling
            gi = ix % grid_w
            gj = iy % grid_h
            g = grads[gj, gi]
            return g[..., 0], g[..., 1]
    else:
        # Coordinate grid in "noise space"
        xs = np.linspace(0, width / scale, width, endpoint=False)
        ys = np.linspace(0, height / scale, height, endpoint=False)
        x, y = np.meshgrid(xs, ys)

        x0 = np.floor(x).astype(int)
        y0 = np.floor(y).astype(int)
        x1 = x0 + 1
        y1 = y0 + 1

        # Local coordinates within each cell
        sx = x - x0
        sy = y - y0

        # Create a gradient vector for each integer lattice point needed
        gx_min, gx_max = x0.min(), x1.max()
        gy_min, gy_max = y0.min(), y1.max()

        grid_w = gx_max - gx_min + 1
        grid_h = gy_max - gy_min + 1

        angles = rng.uniform(0.0, 2.0 * math.pi, size=(grid_h, grid_w))
        grads = np.dstack((np.cos(angles), np.sin(angles)))  # (gy, gx, 2)

        def grad_at(ix: np.ndarray, iy: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
            # Map absolute lattice coords to gradient grid indices
            gi = ix - gx_min
            gj = iy - gy_min
            g = grads[gj, gi]
            return g[..., 0], g[..., 1]

    # Fetch gradients at corners
    g00x, g00y = grad_at(x0, y0)
    g10x, g10y = grad_at(x1, y0)
    g01x, g01y = grad_at(x0, y1)
    g11x, g11y = grad_at(x1, y1)

    # Vectors from corner to point
    dx0 = sx
    dy0 = sy
    dx1 = sx - 1.0
    dy1 = sy - 1.0

    # Dot products
    n00 = g00x * dx0 + g00y * dy0
    n10 = g10x * dx1 + g10y * dy0
    n01 = g01x * dx0 + g01y * dy1
    n11 = g11x * dx1 + g11y * dy1

    # Interpolate
    u = fade(sx)
    v = fade(sy)
    nx0 = lerp(n00, n10, u)
    nx1 = lerp(n01, n11, u)
    nxy = lerp(nx0, nx1, v)

    # Normalize roughly from [-~0.7, ~0.7] into [0,1]
    nxy = (nxy - nxy.min()) / (nxy.max() - nxy.min() + 1e-12)
    return nxy.astype(np.float32)


def fbm(width: int, height: int, base_scale: float, octaves: int, lacunarity: float, gain: float, seed: int, tileable: bool = False) -> np.ndarray:
    """
    Fractal Brownian Motion: sum of octaves of Perlin with increasing frequency.
    Returns [0,1].
    """
    total = np.zeros((height, width), dtype=np.float32)
    amp = 1.0
    amp_sum = 0.0
    scale = base_scale

    for i in range(octaves):
        n = perlin2d(width, height, scale=scale, seed=seed + 1013 * i, tileable=tileable)
        total += n * amp
        amp_sum += amp
        amp *= gain
        scale /= lacunarity  # smaller scale => higher frequency detail

    total /= (amp_sum + 1e-12)
    total = np.clip(total, 0.0, 1.0)
    return total


def main() -> None:
    # Get the directory where this script is located
    script_dir = os.path.dirname(os.path.abspath(__file__))
    default_output = os.path.join(script_dir, "clouds_bw.png")

    ap = argparse.ArgumentParser(description="Generate black/white cloud blobs using thresholded fBm Perlin noise.")
    ap.add_argument("--width", type=int, default=1024)
    ap.add_argument("--height", type=int, default=1024)
    ap.add_argument("--base-scale", type=float, default=220.0, help="Bigger => larger cloud masses.")
    ap.add_argument("--octaves", type=int, default=5, help="More => more edge detail.")
    ap.add_argument("--lacunarity", type=float, default=2.0)
    ap.add_argument("--gain", type=float, default=0.5)
    ap.add_argument("--bias-power", type=float, default=1.0, help="Apply pow(noise, bias_power) before threshold. >1 tightens cores.")
    ap.add_argument("--threshold", type=float, default=0.55, help="Higher => fewer white clouds.")
    ap.add_argument("--invert", action="store_true", help="Invert output (clouds black on white).")
    ap.add_argument("--tileable", action="store_true", help="Make noise seamlessly tileable.")
    ap.add_argument("--padding", type=int, default=0, help="Padding in pixels where clouds fade to black at edges.")
    ap.add_argument("--smooth", type=float, default=3, help="Blur noise before threshold for rounder cloud shapes.")
    ap.add_argument("--feather", type=float, default=5, help="Blur after threshold for soft feathered edges.")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", type=str, default=default_output)
    args = ap.parse_args()

    n = fbm(
        width=args.width,
        height=args.height,
        base_scale=args.base_scale,
        octaves=args.octaves,
        lacunarity=args.lacunarity,
        gain=args.gain,
        seed=args.seed,
        tileable=args.tileable,
    )

    if args.bias_power != 1.0:
        n = np.power(np.clip(n, 0.0, 1.0), args.bias_power)

    # Blur the noise before thresholding for rounder cloud shapes
    if args.smooth > 0:
        n_img = Image.fromarray((n * 255).astype(np.uint8), mode="L")
        n_img = n_img.filter(ImageFilter.GaussianBlur(radius=args.smooth))
        n = np.array(n_img).astype(np.float32) / 255.0

    # Apply edge padding - fade noise to 0 near edges so no clouds get cut off
    if args.padding > 0:
        h, w = n.shape
        # Create falloff masks for each edge
        x = np.arange(w)
        y = np.arange(h)
        # Distance from each edge, normalized to [0,1] over the padding zone
        left = np.clip(x / args.padding, 0, 1)
        right = np.clip((w - 1 - x) / args.padding, 0, 1)
        top = np.clip(y / args.padding, 0, 1)
        bottom = np.clip((h - 1 - y) / args.padding, 0, 1)
        # Combine: minimum distance from any edge
        mask_x = np.minimum(left, right)
        mask_y = np.minimum(top, bottom)
        # Smooth falloff using the fade curve
        mask_x = fade(mask_x)
        mask_y = fade(mask_y)
        # 2D mask is product of x and y falloffs
        mask = np.outer(mask_y, mask_x).astype(np.float32)
        n = n * mask

    # Threshold to binary
    bw = (n > args.threshold).astype(np.uint8) * 255

    if args.invert:
        bw = 255 - bw

    img = Image.fromarray(bw, mode="L")

    # Feather the edges for soft cloud boundaries
    if args.feather > 0:
        img = img.filter(ImageFilter.GaussianBlur(radius=args.feather))

    img.save(args.out)
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
