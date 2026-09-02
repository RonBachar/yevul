// What every /ai/* endpoint shares, stage 5.
//
// **This exists because the second endpoint arrived, not in anticipation of
// it.** voice.ts owned all of this alone until receipts needed the same
// answers, and the three pieces below are the ones where two copies would
// actually hurt:
//
//   1. **The deploy check.** readConfig decides what a missing environment
//      variable means, and it is the reason a bad deploy answers 500 instead of
//      an obscure 401 from the provider three layers down. Two copies means the
//      day a fourth variable is added, one endpoint keeps starting calls it
//      cannot finish — and the farmer pays a month of quota to find out.
//   2. **The error body.** The client picks which Hebrew sentence to show from
//      the reason code, so the envelope those codes travel in is a contract, not
//      a formatting choice.
//   3. **The cost log.** One JSON line per call is what makes `wrangler tail`
//      greppable and lets a log drain parse it later without a format change.
//      Two endpoints writing two shapes would end that on the first day.
//
// What is deliberately *not* here is anything about what a valid request looks
// like. That differs per endpoint, it is the hostile-input boundary, and a
// shared "validate" helper would be the place where one endpoint's rules quietly
// start applying to the other's.

import type { Env } from './gate';
import type { ExtractionUsage, OpenRouterConfig } from './openrouter';

// ============================================================
// The response.
//
// **Reason codes are machine readable and stable**, because the client picks
// which Hebrew sentence to show the farmer from them. A human-readable string
// here would mean the mobile app matching on prose.
// ============================================================

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export function fail(code: string, status: number): Response {
  return json({ error: code }, status);
}

// ============================================================
// Environment configuration.
//
// The three values are optional on Env because that is the truth about what
// wrangler injects, and a var deleted from wrangler.toml simply does not exist
// at runtime. Here is where absence becomes an answer.
// ============================================================

export function readConfig(env: Env): OpenRouterConfig | null {
  const { OPENROUTER_API_KEY: apiKey, OPENROUTER_MODEL: model } = env;
  const fallbackModel = env.OPENROUTER_MODEL_FALLBACK;

  if (!apiKey || !model || !fallbackModel) return null;
  return { apiKey, model, fallbackModel };
}

// The names of the missing vars go to the log, never to the response. This
// check runs before gate, so an unauthenticated caller can reach it, and there
// is no reason to tell that caller how our deploy is wired.
export function missingConfigNames(env: Env): string[] {
  return [
    env.OPENROUTER_API_KEY ? null : 'OPENROUTER_API_KEY',
    env.OPENROUTER_MODEL ? null : 'OPENROUTER_MODEL',
    env.OPENROUTER_MODEL_FALLBACK ? null : 'OPENROUTER_MODEL_FALLBACK',
  ].filter((name): name is string => name !== null);
}

// ============================================================
// Server side accounting.
//
// **The cost and the model id never go to the client.** They are our books,
// not the farmer's business, and shipping them would also tell anyone holding
// a token exactly which provider to price against. They go to console.log
// instead, which is what `wrangler tail` streams, so the cost of a real call
// is observable the moment it happens.
//
// **Nothing on a success path logs the transcript, the audio or the image.**
// That is the farmer's own words and his own paperwork, and neither has a place
// in an operational log. The one exception is a parse failure, where a bounded
// prefix of the model's raw text is logged because it is the only way to tell
// the two failure modes apart. See LOGGED_CONTENT_CHARS.
// ============================================================

// A parse failure returns the model's raw text so the wiring layer can log it,
// and that text contains the farmer's own words or the contents of his invoice.
// Only a bounded prefix is written to the log: enough to tell a response
// truncated at max_tokens from a model that ignored the schema entirely, which
// are two completely different faults, without retaining a full transcript or a
// full supplier record in Cloudflare's log stream.
export const LOGGED_CONTENT_CHARS = 200;

// One JSON line per call, so `wrangler tail` output stays greppable and a log
// drain can parse it later without a format change. The event name is per
// endpoint so the two are separable in a single stream.
export function callLogger(event: string): (fields: Record<string, unknown>) => void {
  return (fields) => {
    console.log(JSON.stringify({ event, ...fields }));
  };
}

export function usageFields(usage: ExtractionUsage): Record<string, unknown> {
  return { model: usage.model, costUsd: usage.costUsd };
}
