/** Story anchors around the dark corner of the lake. */
export const STONE = { x: -88, z: 27 };
export const WAKE = { x: -67, z: 16 };
export const BEAR_TREE = { x: -74, z: 0 };

/** Keeps the sight line from the fall spot up to the bear's branch free of trees. */
export function inClearing(x: number, z: number) {
  const ax = WAKE.x, az = WAKE.z, bx = BEAR_TREE.x - ax, bz = BEAR_TREE.z - az;
  const k = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz)));
  const d = Math.hypot(x - (ax + bx * k), z - (az + bz * k));
  const tx = 1 - 6, tz = 60 - 84, tk = Math.max(0, Math.min(1, ((x - 6) * tx + (z - 84) * tz) / (tx * tx + tz * tz)));
  const trailhead = Math.hypot(x - (6 + tx * tk), z - (84 + tz * tk)) < 7.5;
  return trailhead || d < 6 || Math.hypot(x - ax, z - az) < 9 || Math.hypot(x - STONE.x, z - STONE.z) < 4.5;
}
