/**
 * Reads just enough of a JPEG's marker structure to find its pixel dimensions.
 * We need this so we can size PDF page/image objects correctly when embedding
 * a JPEG directly (DCTDecode passthrough - no re-encoding, no quality loss).
 */
export interface JpegDimensions {
  width: number;
  height: number;
}

export class InvalidJpegError extends Error {}

const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

export function readJpegDimensions(bytes: Uint8Array): JpegDimensions {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new InvalidJpegError("Not a valid JPEG (missing SOI marker 0xFFD8)");
  }

  let offset = 2;
  while (offset < bytes.length - 1) {
    if (bytes[offset] !== 0xff) {
      throw new InvalidJpegError(`Malformed JPEG marker at offset ${offset}`);
    }
    const marker = bytes[offset + 1] as number;

    // Standalone markers with no length/payload.
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }

    if (offset + 3 >= bytes.length) break;
    const segmentLength = ((bytes[offset + 2] as number) << 8) | (bytes[offset + 3] as number);

    if (SOF_MARKERS.has(marker)) {
      if (offset + 9 >= bytes.length) throw new InvalidJpegError("Truncated SOF segment");
      const height = ((bytes[offset + 5] as number) << 8) | (bytes[offset + 6] as number);
      const width = ((bytes[offset + 7] as number) << 8) | (bytes[offset + 8] as number);
      if (width === 0 || height === 0) {
        throw new InvalidJpegError("JPEG reports zero width/height");
      }
      return { width, height };
    }

    if (marker === 0xda) break; // Start of Scan - dimensions must have appeared before this
    offset += 2 + segmentLength;
  }

  throw new InvalidJpegError("Could not locate a Start-Of-Frame marker with dimensions");
}
