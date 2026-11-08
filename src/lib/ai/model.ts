// Safe for client and server: no imports, no environment access.

/** The model that reads the photos. The single place its id is written. */
export const AI_MODEL_ID = 'claude-opus-5-5';

/**
 * Machine-readable marking of AI-written text (EU AI Act Article 50(2)).
 * Spread onto every element that shows text written by the model. `model` is the model the record names (M1);
 * logs from before the model was recorded fall back to the configured model.
 */
export function aiTextMark(model?: string | null): { 'data-ai-generated': 'true'; 'data-ai-model': string } {
  return { 'data-ai-generated': 'true', 'data-ai-model': model ?? AI_MODEL_ID };
}

/** The marking with the configured model, for text that has no record of its own. */
export const AI_TEXT_MARK = aiTextMark();
