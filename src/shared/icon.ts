type Pt = [number, number]

// Shapes in unit space (0..1), drawn upright and then rotated 45° so the arrow launches up and to the right.
const HEAD: Pt[] = [
  [0.5, 0.12],
  [0.29, 0.42],
  [0.71, 0.42]
]
const SHAFT = [0.43, 0.4, 0.57, 0.74] // x0, y0, x1, y1
const RUNWAY_Y = [0.79, 0.83]
const RUNWAY_DASHES = [
  [0.2, 0.32],
  [0.44, 0.56],
  [0.68, 0.8]
]
const TOP = [99, 102, 241] // indigo #6366f1 (r, g, b)
const BOTTOM = [34, 211, 238] // cyan #22d3ee

function inTriangle([px, py]: Pt, [a, b, c]: Pt[]): boolean {
  const side = (p: Pt, q: Pt) => (px - q[0]) * (p[1] - q[1]) - (p[0] - q[0]) * (py - q[1])
  const d1 = side(a, b)
  const d2 = side(b, c)
  const d3 = side(c, a)
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
}

/** What covers a point: 0 = nothing (transparent), 1 = tile, 2 = runway, 3 = arrow. */
function sample(x: number, y: number): number {
  const r = 0.22
  const cx = Math.min(Math.max(x, r), 1 - r)
  const cy = Math.min(Math.max(y, r), 1 - r)
  if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) return 0
  // Rotate the point -45° around the centre into the arrow's upright frame (nudged up-right to clear the runway).
  const dx = x - 0.5
  const dy = y - 0.46
  const ux = 0.5 + (dx + dy) * Math.SQRT1_2
  const uy = 0.5 + (dy - dx) * Math.SQRT1_2
  if (inTriangle([ux, uy], HEAD)) return 3
  if (ux >= SHAFT[0] && ux <= SHAFT[2] && uy >= SHAFT[1] && uy <= SHAFT[3]) return 3
  if (y >= RUNWAY_Y[0] && y <= RUNWAY_Y[1] && RUNWAY_DASHES.some(([a, b]) => x >= a && x <= b)) return 2
  return 1
}

/**
 * Draws the Pushback icon procedurally (a launch arrow over a runway on an indigo→cyan tile)
 * as RGBA pixels. The tray and window icons use it, and `npm run icon` renders build/icon.png from it.
 */
export function drawIcon(size: number): Uint8Array {
  const buf = new Uint8Array(size * size * 4)
  const S = size < 64 ? 4 : 2 // supersample small sizes harder so edges stay crisp
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let covered = 0
      let white = 0
      for (let sy = 0; sy < S; sy++)
        for (let sx = 0; sx < S; sx++) {
          const hit = sample((x + (sx + 0.5) / S) / size, (y + (sy + 0.5) / S) / size)
          if (!hit) continue
          covered++
          if (hit === 3) white += 1
          else if (hit === 2) white += 0.7
        }
      if (!covered) continue
      const t = (x + y) / (2 * size) // diagonal gradient
      const w = white / covered
      const channel = (i: number) => Math.round(TOP[i] + (BOTTOM[i] - TOP[i]) * t + (255 - (TOP[i] + (BOTTOM[i] - TOP[i]) * t)) * w)
      buf.set([channel(0), channel(1), channel(2), Math.round((covered / (S * S)) * 255)], (y * size + x) * 4)
    }
  }
  return buf
}
