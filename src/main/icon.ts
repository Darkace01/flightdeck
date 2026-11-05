import { nativeImage, type NativeImage } from 'electron'

/**
 * Draws the app icon procedurally (a blue rounded tile with three "deck" bars)
 * so we don't need binary assets for the tray and window.
 */
export function trayIcon(size: number): NativeImage {
  const buf = Buffer.alloc(size * size * 4)
  const r = size * 0.22
  const inside = (x: number, y: number): boolean => {
    const cx = Math.min(Math.max(x, r), size - r)
    const cy = Math.min(Math.max(y, r), size - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
  }
  const bars = [
    [0.22, 0.26, 0.78, 0.36],
    [0.22, 0.45, 0.62, 0.55],
    [0.22, 0.64, 0.7, 0.74]
  ]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      if (!inside(x + 0.5, y + 0.5)) continue
      const fx = (x + 0.5) / size
      const fy = (y + 0.5) / size
      const bar = bars.some(([x0, y0, x1, y1]) => fx >= x0 && fx <= x1 && fy >= y0 && fy <= y1)
      // BGRA
      if (bar) buf.set([255, 255, 255, 255], i)
      else buf.set([255, 166, 88, 255], i)
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size })
}
