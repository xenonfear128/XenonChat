/** Minimal magic-byte sniffing for upload validation (CJS-friendly). */

export type DetectedFile = { mime: string; ext: string };

export function detectMimeFromBuffer(buf: Buffer): DetectedFile | null {
  if (buf.length < 4) return null;
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { mime: 'image/png', ext: 'png' };
  }
  // GIF
  if (buf.subarray(0, 4).toString('ascii') === 'GIF8') {
    return { mime: 'image/gif', ext: 'gif' };
  }
  // WEBP: RIFF....WEBP
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.length >= 12 &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  // PDF
  if (buf.subarray(0, 4).toString('ascii') === '%PDF') {
    return { mime: 'application/pdf', ext: 'pdf' };
  }
  // ZIP (also docx)
  if (buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07)) {
    return { mime: 'application/zip', ext: 'zip' };
  }
  // WebM / Matroska
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return { mime: 'video/webm', ext: 'webm' };
  }
  // MP4 / M4A: ....ftyp
  if (buf.length >= 12 && buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('ascii');
    if (brand.startsWith('mp4') || brand === 'isom' || brand === 'iso2' || brand === 'avc1') {
      return { mime: 'video/mp4', ext: 'mp4' };
    }
    if (brand === 'M4A ' || brand === 'M4B ') {
      return { mime: 'audio/mp4', ext: 'm4a' };
    }
    return { mime: 'video/mp4', ext: 'mp4' };
  }
  // OGG
  if (buf.subarray(0, 4).toString('ascii') === 'OggS') {
    return { mime: 'audio/ogg', ext: 'ogg' };
  }
  // WAV
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.length >= 12 &&
    buf.subarray(8, 12).toString('ascii') === 'WAVE'
  ) {
    return { mime: 'audio/wav', ext: 'wav' };
  }
  // MP3 ID3 or frame sync
  if (buf.subarray(0, 3).toString('ascii') === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) {
    return { mime: 'audio/mpeg', ext: 'mp3' };
  }
  return null;
}
