import { imageSize } from 'image-size'

export const screenshotLayouts = Object.freeze([
  Object.freeze({ name: 'small', width: 156, height: 156 }),
  Object.freeze({ name: 'medium', width: 336, height: 156 }),
  Object.freeze({ name: 'large', width: 336, height: 336 }),
])

export function validateScreenshot(bytes, filename, layout) {
  const png = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  const webp =
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  if (
    !(filename.endsWith('.png')
      ? png
      : filename.endsWith('.webp')
        ? webp
        : jpeg)
  )
    throw new Error(
      `${filename}: screenshot bytes do not match its image extension`
    )
  let dimensions
  try {
    dimensions = imageSize(bytes)
  } catch {
    throw new Error(`${filename}: cannot read screenshot image dimensions`)
  }
  const expectedType = filename.endsWith('.png')
    ? 'png'
    : filename.endsWith('.webp')
      ? 'webp'
      : 'jpg'
  if (dimensions.type !== expectedType)
    throw new Error(
      `${filename}: screenshot bytes do not match its image extension`
    )
  // JPEG EXIF rotation may swap the dimensions that a gallery actually displays.
  const rotated = [5, 6, 7, 8].includes(dimensions.orientation)
  const width = rotated ? dimensions.height : dimensions.width
  const height = rotated ? dimensions.width : dimensions.height
  if (width !== layout.width || height !== layout.height)
    throw new Error(
      `${filename}: ${layout.name} screenshot must be ${layout.width}×${layout.height} pixels; got ${width}×${height}`
    )
}
