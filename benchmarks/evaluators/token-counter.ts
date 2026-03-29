import { get_encoding, type Tiktoken } from "tiktoken";

let _encoder: Tiktoken | null = null;

function getEncoder(): Tiktoken {
  if (!_encoder) {
    _encoder = get_encoding("cl100k_base");
  }
  return _encoder;
}

/**
 * Count tokens in a string using cl100k_base (Claude/GPT-4 tokenizer).
 */
export function countTokens(text: string): number {
  return getEncoder().encode(text).length;
}

/**
 * Dispose the encoder to free memory.
 */
export function disposeEncoder(): void {
  if (_encoder) {
    _encoder.free();
    _encoder = null;
  }
}
