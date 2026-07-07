import { describe, expect, it } from "vitest";
import { buildEtag, ifNoneMatchMatches, respondWithEtag } from "./httpCache";

describe("httpCache", () => {
  it("builds a quoted strong etag", () => {
    expect(buildEtag(["workflow", "wf_1", 3, 1000])).toBe('"workflow:wf_1:3:1000"');
  });

  it("matches If-None-Match including weak validators", () => {
    const etag = buildEtag(["a", 1]);
    const req = new Request("http://localhost", {
      headers: { "if-none-match": `W/${etag}` },
    });
    expect(ifNoneMatchMatches(req, etag)).toBe(true);
  });

  it("returns 304 when the etag matches", async () => {
    const etag = buildEtag(["doc", "1"]);
    const req = new Request("http://localhost", {
      headers: { "if-none-match": etag },
    });

    const res = respondWithEtag(req, etag, { ok: true });
    expect(res.status).toBe(304);
    expect(res.headers.get("ETag")).toBe(etag);
    expect(await res.text()).toBe("");
  });

  it("returns 200 with body when the etag does not match", async () => {
    const etag = buildEtag(["doc", "2"]);
    const req = new Request("http://localhost", {
      headers: { "if-none-match": buildEtag(["doc", "1"]) },
    });

    const res = respondWithEtag(req, etag, { ok: true });
    expect(res.status).toBe(200);
    expect(res.headers.get("ETag")).toBe(etag);
    expect(await res.json()).toEqual({ ok: true });
  });
});
