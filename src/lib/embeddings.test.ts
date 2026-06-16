import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EMBEDDING_DIMENSIONS,
  EmbeddingsError,
  embedTexts,
  embeddingsEnabled,
  vectorLiteral,
} from "./embeddings";

function fakeFetch(payload: unknown, status = 200): typeof fetch {
  return vi.fn(
    async () => new Response(JSON.stringify(payload), { status }),
  ) as unknown as typeof fetch;
}

describe("embeddings client (P4.3)", () => {
  beforeEach(() => {
    process.env.VOYAGE_API_KEY = "test-key";
  });
  afterEach(() => {
    delete process.env.VOYAGE_API_KEY;
  });

  it("embeddingsEnabled tracks the env var", () => {
    expect(embeddingsEnabled()).toBe(true);
    delete process.env.VOYAGE_API_KEY;
    expect(embeddingsEnabled()).toBe(false);
  });

  it("throws when the provider is not configured", async () => {
    delete process.env.VOYAGE_API_KEY;
    await expect(embedTexts(["x"], "document")).rejects.toThrow(
      EmbeddingsError,
    );
  });

  it("returns vectors in input order (re-sorted by index)", async () => {
    const a = Array(EMBEDDING_DIMENSIONS).fill(0.1);
    const b = Array(EMBEDDING_DIMENSIONS).fill(0.2);
    // Provider replies out of order — client must re-sort by index.
    const result = await embedTexts(
      ["first", "second"],
      "document",
      fakeFetch({
        data: [
          { index: 1, embedding: b },
          { index: 0, embedding: a },
        ],
      }),
    );
    expect(result[0][0]).toBeCloseTo(0.1);
    expect(result[1][0]).toBeCloseTo(0.2);
  });

  it("sends input_type and output_dimension", async () => {
    const mock = fakeFetch({
      data: [{ index: 0, embedding: Array(EMBEDDING_DIMENSIONS).fill(0) }],
    });
    await embedTexts(["q"], "query", mock);
    const body = JSON.parse(
      (vi.mocked(mock).mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.input_type).toBe("query");
    expect(body.output_dimension).toBe(EMBEDDING_DIMENSIONS);
  });

  it("rejects wrong-dimension vectors and HTTP errors", async () => {
    await expect(
      embedTexts(
        ["x"],
        "document",
        fakeFetch({ data: [{ index: 0, embedding: [1, 2] }] }),
      ),
    ).rejects.toThrow(/dims/);
    await expect(
      embedTexts(["x"], "document", fakeFetch({ error: "nope" }, 401)),
    ).rejects.toThrow(/401/);
  });

  it("empty input short-circuits without a network call", async () => {
    const mock = fakeFetch({ data: [] });
    expect(await embedTexts([], "document", mock)).toEqual([]);
    expect(vi.mocked(mock).mock.calls.length).toBe(0);
  });
});

describe("vectorLiteral", () => {
  it("formats a pgvector literal", () => {
    expect(vectorLiteral([0.1, -2, 3])).toBe("[0.1,-2,3]");
  });

  it("rejects non-finite values", () => {
    expect(() => vectorLiteral([1, Infinity])).toThrow(EmbeddingsError);
    expect(() => vectorLiteral([NaN])).toThrow(EmbeddingsError);
  });
});
