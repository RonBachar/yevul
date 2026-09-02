import { gate, type Env } from './gate';
import { handleReceipt } from './receipt';
import { handleVoice } from './voice';

export type { Env };

// ה-Worker, שלב 5. שומר הסף מול OpenRouter, אוכף מסלול ומכסה בשרת,
// prd.md סעיף 12. הצעד הראשון של השלב בונה את השומר בלבד: אין כאן
// עדיין תמלול ואין קריאה ל-LLM, וזה מכוון. השומר הוא החלק שהכי יקר
// לתקן בדיעבד, כי טעות בו היא חשבון OpenRouter פתוח.
//
// **/ai/check קיים כדי לבדוק את השומר בלי לשרוף כסף.** הוא רץ בדיוק
// דרך אותו gate שכל נקודת קצה של AI תרוץ דרכו, ולכן הוא מאמת את
// האכיפה עצמה ולא הדמיה שלה. הוא **כן צורך מכסה**, כי הוא בודק את
// הצריכה, ולכן אינו נשאר בפרודקשן אחרי שנקודות הקצה האמיתיות קיימות.
//
// It stays for now even though /ai/voice exists, because it is still the only
// way to exercise the gate without paying, and the Worker has never been
// deployed (there is no Cloudflare account yet). It is removed once /ai/voice
// has been verified against a deployed Worker.
//
// This file stays a router and nothing else. The wiring that connects gate to
// OpenRouter to the validators lives in voice.ts and receipt.ts, which is what
// made adding the second endpoint another line here rather than a second nest of
// validation inside the dispatcher. That was the bet when voice.ts was written,
// and it paid: nothing in this file changed except one route.

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response('ok', { status: 200 });
    }

    if (url.pathname === '/ai/check' && request.method === 'POST') {
      const result = await gate(request, env);
      if (!result.ok) {
        return json({ error: result.reason }, result.status);
      }
      return json({ farmId: result.farmId, entitled: result.entitled });
    }

    if (url.pathname === '/ai/voice' && request.method === 'POST') {
      // The global fetch is injected here, at the edge of the system, and
      // nowhere below. That is what makes it impossible for a test to reach
      // the network by forgetting a mock.
      return handleVoice(request, env, fetch);
    }

    // Receipt OCR. **The paid-only rule is not enforced here.** It is a property
    // of the endpoint and it lives inside handleReceipt, which asks gate() for
    // it — a check in this dispatcher would run before the request shape was
    // validated and would be one more thing for the next endpoint to remember.
    if (url.pathname === '/ai/receipt' && request.method === 'POST') {
      return handleReceipt(request, env, fetch);
    }

    return new Response('not found', { status: 404 });
  },
};
