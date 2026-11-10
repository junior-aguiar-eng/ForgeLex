/**
 * Size limits of the agentic workspace input. One source of truth so the form, the start check,
 * the source schema and the evidence offsets cannot drift apart.
 */
/** Largest text, in characters, accepted as a single source or as the written context of a job. */
export const MAX_SOURCE_TEXT_CHARS = 100000;
/** The same text measured in UTF-8 bytes; Portuguese accents take two bytes, so this is wider than the character cap. */
export const MAX_SOURCE_TEXT_BYTES = 112000;
/**
 * Largest serialized request to the commercial provider: source text plus instructions, tool schemas and the
 * results of earlier rounds. Wider than MAX_SOURCE_TEXT_BYTES so a maximum-size text still fits with them.
 */
export const MAX_COMMERCIAL_REQUEST_BYTES = 128000;
/** True when `text` is over the entry limits, by characters or by UTF-8 bytes. */
export function exceedsSourceTextLimit(text: string): boolean {
  return text.length > MAX_SOURCE_TEXT_CHARS || new TextEncoder().encode(text).length > MAX_SOURCE_TEXT_BYTES;
}
