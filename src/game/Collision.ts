import * as THREE from 'three';

export interface Circle { x: number; z: number; r: number }

export class Colliders {
  private cell = 6;
  private grid = new Map<number, Circle[]>();
  private key(ix: number, iz: number) {
    return (ix + 1000) * 4000 + (iz + 1000);
  }
  add(c: Circle) {
    const ix = Math.floor(c.x / this.cell), iz = Math.floor(c.z / this.cell);
    const k = this.key(ix, iz);
    let arr = this.grid.get(k);
    if (!arr) this.grid.set(k, (arr = []));
    arr.push(c);
  }
  addAll(list: Circle[]) {
    list.forEach((c) => this.add(c));
  }
  resolve(p: THREE.Vector3, radius: number) {
    const ix = Math.floor(p.x / this.cell), iz = Math.floor(p.z / this.cell);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        const arr = this.grid.get(this.key(ix + dx, iz + dz));
        if (!arr) continue;
        for (const c of arr) {
          const vx = p.x - c.x, vz = p.z - c.z;
          const d = Math.hypot(vx, vz), min = c.r + radius;
          if (d < min && d > 1e-4) {
            p.x = c.x + (vx / d) * min;
            p.z = c.z + (vz / d) * min;
          }
        }
      }
  }
  nearest(x: number, z: number, maxR = 12) {
    let best: Circle | null = null, bd = maxR;
    const ix = Math.floor(x / this.cell), iz = Math.floor(z / this.cell);
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++) {
        const arr = this.grid.get(this.key(ix + dx, iz + dz));
        if (!arr) continue;
        for (const c of arr) {
          const d = Math.hypot(x - c.x, z - c.z);
          if (d < bd) { bd = d; best = c; }
        }
      }
    return best;
  }
}
