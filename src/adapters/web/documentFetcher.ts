// Fetches a public JSON document, such as a profile file at profileUrl.

import type { DocumentFetcher } from "@/engine/ports";
import { safeFetch } from "./safeUrl";

const MAX_BYTES = 5_000_000;

export class HttpDocumentFetcher implements DocumentFetcher {
  async getJson(url: string): Promise<unknown> {
    const res = await safeFetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error("Document too large");
    return JSON.parse(text.replace(/^﻿/, ""));
  }
}
