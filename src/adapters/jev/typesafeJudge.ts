// TypeSafe Jev over HTTP. Adds the key, pins the model, retries transient failures, checks the reported version.

import { intentRequest, termRequest, norm } from "@/core/questions";
import type { JudgeState } from "@/core/text";
import type { Judge } from "@/engine/ports";

export class ModelMismatch extends Error {
  constructor(public reported: string, pinned: string) {
    super(`Jev answered with ${reported}, not the pinned ${pinned}`);
  }
}

export class TypeSafeJudge implements Judge {
  readonly simulated = false;
  constructor(readonly model: string, private apiUrl: string, private key: string) {}

  private async post(body: unknown): Promise<any> {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(this.apiUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      if ((res.status === 429 || res.status === 408 || res.status === 499 || res.status >= 500) && attempt < 5) {
        await new Promise((r) => setTimeout(r, 600 * 2 ** attempt));
        continue;
      }
      if (!res.ok) throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json = await res.json();
      if (json.model !== this.model) throw new ModelMismatch(json.model, this.model);
      return json;
    }
  }

  async intentFit(state: JudgeState, intent: string) {
    const json = await this.post(intentRequest(this.model, state, intent));
    const a = json.answers.intent_fit;
    return { score: norm(a.score), probabilities: a.probabilities as Record<string, number>, model: json.model as string };
  }

  async termRatings(state: JudgeState, terms: string[]) {
    const json = await this.post(termRequest(this.model, state, terms));
    return { ratings: terms.map((_, i) => norm(json.answers[`t${String(i).padStart(2, "0")}`].score)), model: json.model as string };
  }
}
