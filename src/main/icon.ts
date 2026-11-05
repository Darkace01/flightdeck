import { nativeImage, type NativeImage } from 'electron'
import { drawIcon } from '../shared/icon'

export function appIcon(size: number): NativeImage {
  const px = Buffer.from(drawIcon(size))
  // createFromBitmap wants BGRA; swap the red and blue channels.
  for (let i = 0; i < px.length; i += 4) [px[i], px[i + 2]] = [px[i + 2], px[i]]
  return nativeImage.createFromBitmap(px, { width: size, height: size })
}
