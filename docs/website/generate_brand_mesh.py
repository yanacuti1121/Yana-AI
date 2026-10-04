"""Build the Y sculpture's interleaved position/normal/rim mesh (requires NumPy).

Run this file to regenerate docs/assets/yana-brand-mesh.bin. The browser uses
the binary directly; NumPy is only a build-time dependency.
"""

from pathlib import Path

import numpy as np


def smooth_min(a, b, radius):
    blend = np.maximum(radius - np.abs(a - b), 0) / radius
    return np.minimum(a, b) - blend * blend * radius * 0.25


def segment(point, start, end, radius_start, radius_end):
    start, end = np.asarray(start), np.asarray(end)
    direction = end - start
    t = np.clip(np.sum((point - start) * direction, axis=-1) / np.dot(direction, direction), 0, 1)
    return np.linalg.norm(point - (start + t[..., None] * direction), axis=-1) - (
        radius_start + (radius_end - radius_start) * t
    )


def ellipse(point, center, radii, angle=0):
    q = point - np.asarray(center)
    c, s = np.cos(angle), np.sin(angle)
    x, y = q[..., 0] * c - q[..., 1] * s, q[..., 0] * s + q[..., 1] * c
    return (np.sqrt((x / radii[0]) ** 2 + (y / radii[1]) ** 2) - 1) * min(radii)


def outline(point):
    """Retain the established flared Y silhouette."""
    stem = segment(point, [0, -1.12], [0, 0.2], 0.25, 0.32)
    left = segment(point, [-0.03, 0.05], [-1.14, 0.94], 0.29, 0.28)
    right = segment(point, [0.03, 0.05], [1.16, 1.0], 0.29, 0.30)
    distance = smooth_min(smooth_min(stem, left, 0.16), right, 0.16)
    distance = smooth_min(distance, ellipse(point, [-1.14, 0.96], [0.48, 0.27], -0.42), 0.13)
    distance = smooth_min(distance, ellipse(point, [1.16, 1.01], [0.50, 0.27], 0.42), 0.13)
    return smooth_min(distance, ellipse(point, [0, -1.13], [0.31, 0.20]), 0.08)


def build_mesh(samples=320, bands=16):
    angles = np.arange(samples) * (2 * np.pi / samples)
    directions = np.column_stack((np.cos(angles), np.sin(angles)))
    low, high = np.zeros(samples), np.full(samples, 2.5)
    for _ in range(28):
        middle = (low + high) * 0.5
        inside = outline(directions * middle[:, None]) < 0
        low, high = np.where(inside, middle, low), np.where(inside, high, middle)
    boundary = directions * low[:, None]

    # Cosine-spaced rings give rounded edges more samples without inflating
    # the whole mesh. The two curved faces share their equator and normals.
    fractions = np.sin(np.linspace(0, np.pi / 2, bands + 1))
    xy = fractions[:, None, None] * boundary[None, :, :]
    # Measure against the actual contour, not the outline's approximate SDF.
    # Flared tips can extend beyond that SDF along a polar ray; using it there
    # would collapse the two faces together. Work one edge at a time to keep
    # generation memory small.
    squared_distance = np.full(xy.shape[:2], np.inf)
    nearest_delta = np.zeros_like(xy)
    for i, start in enumerate(boundary):
        direction = boundary[(i + 1) % samples] - start
        t = np.clip(np.sum((xy - start) * direction, axis=-1) / np.dot(direction, direction), 0, 1)
        delta = start + t[..., None] * direction - xy
        candidate = np.sum(delta * delta, axis=-1)
        nearer = candidate < squared_distance
        squared_distance = np.minimum(squared_distance, candidate)
        nearest_delta = np.where(nearer[..., None], delta, nearest_delta)
    distance = -np.sqrt(squared_distance)
    gradient = nearest_delta / np.maximum(-distance[..., None], 1e-10)
    tangent = np.roll(boundary, -1, axis=0) - np.roll(boundary, 1, axis=0)
    edge_normal = np.column_stack((tangent[:, 1], -tangent[:, 0]))
    edge_normal /= np.linalg.norm(edge_normal, axis=-1, keepdims=True)
    gradient[-1] = edge_normal
    depth, rounding = 0.29, 0.115
    edge = np.exp(distance / rounding)
    height = depth * np.sqrt(np.maximum(1 - edge, 0))
    height[-1] = 0
    # A small continuous twist gives both faces a soft changing reflection.
    phase = 1.5 * xy[..., 0] - 0.8 * xy[..., 1]
    middle_z = 0.035 * np.sin(phase)
    middle_gradient = 0.035 * np.cos(phase)[..., None] * [1.5, -0.8]
    slope = -depth * edge / (2 * rounding * np.sqrt(np.maximum(1 - edge, 1e-10)))
    rim = np.exp(distance / 0.10)
    rim[-1] = 1

    triangles = []
    for side in (1, -1):
        positions = np.concatenate((xy, (middle_z + side * height)[..., None]), axis=-1)
        z_gradient = middle_gradient + side * slope[..., None] * gradient
        normals = np.concatenate((-side * z_gradient, np.full((*distance.shape, 1), side)), axis=-1)
        normals[-1] = np.column_stack((gradient[-1], np.zeros(samples)))
        normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
        # Blend the normals across medial transitions of the contour-distance
        # field. Keep the shared equator exact so highlights have no hard seam.
        equator = normals[-1].copy()
        for _ in range(2):
            inward = np.concatenate((normals[:1], normals[:-1]), axis=0)
            outward = np.concatenate((normals[1:], normals[-1:]), axis=0)
            normals = (normals * 0.4 + (np.roll(normals, 1, axis=1) + np.roll(normals, -1, axis=1)) * 0.15
                       + (inward + outward) * 0.15)
            normals[0] = normals[0].mean(axis=0)
            normals[-1] = equator
            normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
        nodes = np.concatenate((positions, normals, rim[..., None]), axis=-1)
        for i in range(samples):
            following = (i + 1) % samples
            # One center fan, rather than collapsed quads with zero-area faces.
            triangles.append([nodes[0, i], nodes[1, i], nodes[1, following]])
            for band in range(1, bands):
                a, b = nodes[band, i], nodes[band, following]
                c, d = nodes[band + 1, following], nodes[band + 1, i]
                triangles.extend(([a, b, c], [a, c, d]))

    packed = np.asarray(triangles)
    face_normal = np.cross(packed[:, 1, :3] - packed[:, 0, :3], packed[:, 2, :3] - packed[:, 0, :3])
    reverse = np.sum(face_normal * packed[:, :, 3:6].mean(axis=1), axis=1) < 0
    packed[reverse] = packed[reverse][:, [0, 2, 1], :]
    assert np.isfinite(packed).all(), "Mesh contains invalid values"
    assert np.all(np.linalg.norm(face_normal, axis=1) > 1e-10), "Mesh contains collapsed triangles"
    assert np.allclose(np.linalg.norm(packed[:, :, 3:6], axis=-1), 1), "Mesh normals are not unit length"
    return packed.astype('<f4').reshape(-1, 7)


if __name__ == '__main__':
    assets = Path(__file__).resolve().parents[1] / 'assets'
    for filename, samples, bands in [('yana-brand-mesh.bin', 320, 16), ('yana-brand-mesh-mobile.bin', 144, 10)]:
        output = assets / filename
        mesh = build_mesh(samples, bands)
        mesh.tofile(output)
        print(f'{filename}: {len(mesh) // 3:,} triangles; {output.stat().st_size:,} bytes; finite unit normals; no collapsed faces')
