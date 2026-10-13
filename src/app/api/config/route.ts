import { CONCURRENCY, MODEL, MOCK, APP_AUTH, configError } from "@/lib/server/config";
import { QUESTION_VERSION } from "@/questions";
import { json } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export function GET() {
  return json({ model: MODEL, concurrency: CONCURRENCY, questionVersion: QUESTION_VERSION, mock: MOCK, auth: APP_AUTH, error: configError() });
}
