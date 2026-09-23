import 'server-only';

export type SupportedProfileImageMime =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/gif';

export type InspectedProfileImage = {
  mimeType: SupportedProfileImageMime;
  extension: 'jpg' | 'png' | 'webp' | 'gif';
  width: number;
  height: number;
  animated: boolean;
};

function readUInt24LE(bytes: Buffer, offset: number) {
  if (offset < 0 || offset + 3 > bytes.length) return null;
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16)
  ) >>> 0;
}

function pngChunkExists(bytes: Buffer, chunkType: string) {
  let offset = 8;

  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');

    if (type === chunkType) return true;
    if (length > bytes.length - offset - 12) return false;

    offset += 12 + length;
    if (type === 'IEND') break;
  }

  return false;
}

function webpChunkExists(bytes: Buffer, chunkType: string) {
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const type = bytes.subarray(offset, offset + 4).toString('ascii');
    const length = bytes.readUInt32LE(offset + 4);

    if (type === chunkType) return true;
    if (length > bytes.length - offset - 8) return false;

    offset += 8 + length + (length % 2);
  }

  return false;
}

function inspectPng(bytes: Buffer): InspectedProfileImage | null {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  if (
    bytes.length < 24 ||
    !bytes.subarray(0, signature.length).equals(signature) ||
    bytes.subarray(12, 16).toString('ascii') !== 'IHDR'
  ) {
    return null;
  }

  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);

  return {
    mimeType: 'image/png',
    extension: 'png',
    width,
    height,
    animated: pngChunkExists(bytes, 'acTL'),
  };
}

function inspectGif(bytes: Buffer): InspectedProfileImage | null {
  if (bytes.length < 10) return null;

  const header = bytes.subarray(0, 6).toString('ascii');
  if (header !== 'GIF87a' && header !== 'GIF89a') return null;

  return {
    mimeType: 'image/gif',
    extension: 'gif',
    width: bytes.readUInt16LE(6),
    height: bytes.readUInt16LE(8),
    // AnimeBox treats GIF as animated media even when a particular file has
    // only one frame. That keeps policy deterministic and avoids a full GIF
    // frame parser on the upload hot path.
    animated: true,
  };
}

function inspectWebp(bytes: Buffer): InspectedProfileImage | null {
  if (
    bytes.length < 30 ||
    bytes.subarray(0, 4).toString('ascii') !== 'RIFF' ||
    bytes.subarray(8, 12).toString('ascii') !== 'WEBP'
  ) {
    return null;
  }

  const chunk = bytes.subarray(12, 16).toString('ascii');
  let width = 0;
  let height = 0;

  if (chunk === 'VP8X') {
    const widthMinusOne = readUInt24LE(bytes, 24);
    const heightMinusOne = readUInt24LE(bytes, 27);
    if (widthMinusOne === null || heightMinusOne === null) return null;
    width = widthMinusOne + 1;
    height = heightMinusOne + 1;
  } else if (chunk === 'VP8 ') {
    if (
      bytes.length < 30 ||
      bytes[23] !== 0x9d ||
      bytes[24] !== 0x01 ||
      bytes[25] !== 0x2a
    ) {
      return null;
    }

    width = bytes.readUInt16LE(26) & 0x3fff;
    height = bytes.readUInt16LE(28) & 0x3fff;
  } else if (chunk === 'VP8L') {
    if (bytes.length < 25 || bytes[20] !== 0x2f) return null;

    const b1 = bytes[21];
    const b2 = bytes[22];
    const b3 = bytes[23];
    const b4 = bytes[24];

    width = 1 + (((b2 & 0x3f) << 8) | b1);
    height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
  } else {
    return null;
  }

  return {
    mimeType: 'image/webp',
    extension: 'webp',
    width,
    height,
    animated: webpChunkExists(bytes, 'ANIM'),
  };
}

function isJpegSofMarker(marker: number) {
  return [
    0xc0,
    0xc1,
    0xc2,
    0xc3,
    0xc5,
    0xc6,
    0xc7,
    0xc9,
    0xca,
    0xcb,
    0xcd,
    0xce,
    0xcf,
  ].includes(marker);
}

function inspectJpeg(bytes: Buffer): InspectedProfileImage | null {
  if (
    bytes.length < 4 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff
  ) {
    return null;
  }

  let offset = 2;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;

    const marker = bytes[offset];
    offset += 1;

    if (
      marker === 0xd8 ||
      marker === 0xd9 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      continue;
    }

    if (offset + 2 > bytes.length) break;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;

    if (isJpegSofMarker(marker)) {
      if (segmentLength < 7 || offset + 7 > bytes.length) return null;

      return {
        mimeType: 'image/jpeg',
        extension: 'jpg',
        width: bytes.readUInt16BE(offset + 5),
        height: bytes.readUInt16BE(offset + 3),
        animated: false,
      };
    }

    offset += segmentLength;
  }

  return null;
}

export function inspectProfileImageBytes(
  bytes: Buffer,
): InspectedProfileImage | null {
  return (
    inspectPng(bytes) ||
    inspectGif(bytes) ||
    inspectWebp(bytes) ||
    inspectJpeg(bytes)
  );
}
