// src/domain/bencode.ts
export type BencodeErrorKind = "malformed" | "oversized" | "not_torrent" | "v2_rejected";

export class BencodeError extends Error {
  constructor(
    readonly kind: BencodeErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "BencodeError";
  }
}

export interface ParsedTorrent {
  readonly infoBytes: Uint8Array; // exact raw slice of the info dict (including leading 'd' ... trailing 'e')
  readonly name: string;
  readonly isV1Single: boolean;
  readonly isV1Multi: boolean;
}

const MAX_DEPTH = 20;
const MAX_STRING = 1 * 1024 * 1024; // 1 MiB per string

type BencodeValue =
  | { readonly kind: "int"; readonly value: number }
  | { readonly kind: "str"; readonly bytes: Uint8Array; readonly text: string }
  | { readonly kind: "list"; readonly items: readonly BencodeValue[] }
  | { readonly kind: "dict"; readonly entries: ReadonlyMap<string, BencodeValue> };

interface InfoRange {
  start: number;
  end: number;
}

const textDecoder = new TextDecoder();

class Cursor {
  private pos = 0;
  constructor(private readonly bytes: Uint8Array) {}
  get position(): number {
    return this.pos;
  }
  get length(): number {
    return this.bytes.length;
  }
  peek(): number | undefined {
    return this.bytes[this.pos];
  }
  next(): number | undefined {
    return this.bytes[this.pos++];
  }
  skip(n: number): void {
    this.pos += n;
  }
  slice(start: number, end: number): Uint8Array {
    return this.bytes.subarray(start, end);
  }
}

function fail(kind: BencodeErrorKind, message: string): never {
  throw new BencodeError(kind, message);
}

function parseIntValue(c: Cursor): number {
  let raw = "";
  const first = c.peek();
  let neg = false;
  if (first === 0x2d) {
    neg = true;
    c.next();
  }
  for (;;) {
    const b = c.next();
    if (b === undefined) fail("malformed", "malformed: unterminated integer");
    if (b === 0x65) break; // 'e'
    if (b < 0x30 || b > 0x39) fail("malformed", "malformed: invalid integer digit");
    raw += String.fromCharCode(b);
  }
  if (raw.length === 0) fail("malformed", "malformed: empty integer");
  if (neg && raw === "0") fail("malformed", "malformed: negative zero integer");
  if (raw.length > 1 && raw[0] === "0") fail("malformed", "malformed: leading zero integer");
  const value = Number(neg ? `-${raw}` : raw);
  if (!Number.isSafeInteger(value)) fail("malformed", "malformed: integer outside safe range");
  return value;
}

function parseStringValue(c: Cursor, firstDigit: number): BencodeValue {
  let length = firstDigit - 0x30;
  for (;;) {
    const b = c.peek();
    if (b === undefined) fail("malformed", "malformed: unterminated string length");
    if (b === 0x3a) {
      c.next();
      break; // ':'
    }
    if (b < 0x30 || b > 0x39) fail("malformed", "malformed: invalid string length byte");
    c.next();
    length = length * 10 + (b - 0x30);
    if (length > MAX_STRING) fail("oversized", "oversized: string length exceeds 1 MiB");
  }
  const start = c.position;
  if (start + length > c.length) fail("malformed", "malformed: string content beyond end of input");
  const bytes = c.slice(start, start + length);
  c.skip(length);
  return { kind: "str", bytes, text: textDecoder.decode(bytes) };
}

function parseListItems(c: Cursor, depth: number): readonly BencodeValue[] {
  const items: BencodeValue[] = [];
  for (;;) {
    const b = c.peek();
    if (b === undefined) fail("malformed", "malformed: unterminated list");
    if (b === 0x65) {
      c.next();
      return items; // 'e'
    }
    items.push(parseValue(c, depth + 1));
  }
}

function parseDictEntries(
  c: Cursor,
  depth: number,
  infoRange: InfoRange | null,
): ReadonlyMap<string, BencodeValue> {
  const entries = new Map<string, BencodeValue>();
  for (;;) {
    const b = c.peek();
    if (b === undefined) fail("malformed", "malformed: unterminated dictionary");
    if (b === 0x65) {
      c.next();
      return entries; // 'e'
    }
    const key = parseValue(c, depth + 1);
    if (key.kind !== "str") fail("malformed", "malformed: dictionary key is not a string");
    if (infoRange !== null && key.text === "info") {
      infoRange.start = c.position;
    }
    const value = parseValue(c, depth + 1);
    if (infoRange !== null && key.text === "info") {
      infoRange.end = c.position;
    }
    entries.set(key.text, value);
  }
}

function parseValue(c: Cursor, depth: number, infoRange: InfoRange | null = null): BencodeValue {
  if (depth > MAX_DEPTH) fail("malformed", "malformed: max nesting depth exceeded");
  const tag = c.next();
  if (tag === undefined) fail("malformed", "malformed: unexpected end of input");
  if (tag === 0x69) return { kind: "int", value: parseIntValue(c) }; // 'i'
  if (tag === 0x6c) return { kind: "list", items: parseListItems(c, depth) }; // 'l'
  if (tag === 0x64) return { kind: "dict", entries: parseDictEntries(c, depth, infoRange) }; // 'd'
  if (tag >= 0x30 && tag <= 0x39) return parseStringValue(c, tag); // '0'-'9'
  fail("malformed", `malformed: unexpected byte 0x${tag.toString(16)}`);
}

export function parseTorrent(bytes: Uint8Array): ParsedTorrent {
  const first = bytes[0];
  if (first === undefined) fail("not_torrent", "not_torrent: empty input");
  if (first !== 0x64) fail("not_torrent", "not_torrent: expected a dictionary root");

  const c = new Cursor(bytes);
  c.next(); // consume the leading 'd' of the root dictionary
  const infoRange: InfoRange = { start: -1, end: -1 };
  const entries = parseDictEntries(c, 0, infoRange);

  const info = entries.get("info");
  if (info === undefined) fail("malformed", "malformed: missing info dictionary");
  if (info.kind !== "dict") fail("malformed", "malformed: info is not a dictionary");

  const metaVersion = info.entries.get("meta version");
  if (metaVersion !== undefined) {
    if (metaVersion.kind !== "int") fail("malformed", "malformed: meta version is not an integer");
    if (metaVersion.value === 2)
      fail("v2_rejected", "v2_rejected: v2 or hybrid metadata unsupported");
    fail("malformed", "malformed: unknown meta version");
  }

  const nameValue = info.entries.get("name");
  if (nameValue === undefined || nameValue.kind !== "str") {
    fail("malformed", "malformed: info requires a string name");
  }

  const lengthValue = info.entries.get("length");
  const filesValue = info.entries.get("files");
  if ((lengthValue === undefined) === (filesValue === undefined))
    fail("malformed", "malformed: info requires exactly one of length or files");
  if (lengthValue !== undefined && lengthValue.kind !== "int") {
    fail("malformed", "malformed: length is not an integer");
  }
  if (filesValue !== undefined && filesValue.kind !== "list") {
    fail("malformed", "malformed: files is not a list");
  }

  return {
    infoBytes: c.slice(infoRange.start, infoRange.end),
    name: nameValue.text,
    isV1Single: lengthValue !== undefined,
    isV1Multi: filesValue !== undefined,
  };
}
