/** Random-access byte source, so the same parsing code runs on browser `File`s and Node file handles. */
export interface ByteSource {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

export function blobSource(blob: Blob): ByteSource {
  return {
    size: blob.size,
    async read(offset, length) {
      const buffer = await blob.slice(offset, offset + length).arrayBuffer();
      return new Uint8Array(buffer);
    },
  };
}
