// src/domain/infohash.ts
export async function computeV1InfoHash(infoBytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", infoBytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
