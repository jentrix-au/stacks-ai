/**
 * Embeddings client (P4.3). Voyage AI over raw fetch — no SDK dep, same
 * optional-integration pattern as Pusher/R2/Resend: without VOYAGE_API_KEY
 * the semantic layer silently no-ops (sweep embeds nothing, similarity
 * queries return empty with a notice).
 *
 * Vectors are stored in pgvector columns (Task.embedding, Contact.embedding,
 * 1024 dims) and written exclusively through raw SQL by the cron sweep.
 */

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const DEFAULT_MODEL = "voyage-3.5-lite";
/** Must match the vector(1024) columns in the P4.3 migration. */
export const EMBEDDING_DIMENSIONS = 1024;
/** Max texts per API call (well under Voyage's batch limits). */
export const EMBED_BATCH_SIZE = 32;

export function embeddingsEnabled(): boolean {
  return Boolean(process.env.VOYAGE_API_KEY);
}

/** Voyage embeds queries and documents asymmetrically — pass the right one. */
export type EmbedInputType = "document" | "query";

export class EmbeddingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingsError";
  }
}

/**
 * Embed a batch of texts. Throws EmbeddingsError when the provider is not
 * configured or replies with anything unexpected — callers decide whether
 * that's fatal (a tool call) or skippable (the sweep).
 */
export async function embedTexts(
  texts: string[],
  inputType: EmbedInputType,
  fetchImpl: typeof fetch = fetch,
): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new EmbeddingsError("VOYAGE_API_KEY is not set");
  if (texts.length === 0) return [];
  if (texts.length > EMBED_BATCH_SIZE) {
    throw new EmbeddingsError(
      `Batch too large: ${texts.length} > ${EMBED_BATCH_SIZE}`,
    );
  }

  const res = await fetchImpl(VOYAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: texts,
      model: process.env.STACKS_EMBEDDINGS_MODEL ?? DEFAULT_MODEL,
      input_type: inputType,
      output_dimension: EMBEDDING_DIMENSIONS,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new EmbeddingsError(
      `Embeddings API ${res.status}: ${body.slice(0, 200)}`,
    );
  }

  const json = (await res.json()) as {
    data?: { index?: number; embedding?: number[] }[];
  };
  const data = json.data;
  if (!Array.isArray(data) || data.length !== texts.length) {
    throw new EmbeddingsError(
      `Embeddings API returned ${data?.length ?? 0} vectors for ${texts.length} texts`,
    );
  }
  const ordered = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return ordered.map((row, i) => {
    const vec = row.embedding;
    if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIMENSIONS) {
      throw new EmbeddingsError(
        `Vector ${i} has ${Array.isArray(vec) ? vec.length : "no"} dims, expected ${EMBEDDING_DIMENSIONS}`,
      );
    }
    return vec;
  });
}

/**
 * pgvector input literal ("[0.1,0.2,...]") for `$1::vector` parameters.
 * Non-finite values would corrupt the cast — reject them.
 */
export function vectorLiteral(vec: number[]): string {
  for (const v of vec) {
    if (!Number.isFinite(v)) {
      throw new EmbeddingsError("Vector contains a non-finite value");
    }
  }
  return `[${vec.join(",")}]`;
}
