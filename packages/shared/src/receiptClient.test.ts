// Tests for the client side of POST /ai/receipt,
// packages/shared/src/receiptClient.ts.
//
// **The block this file exists for is "the two 403s".** Everything else here is
// voiceClient.test.ts's shape applied to a second endpoint; the paid-plan split
// is the part that is new, the part a copy-paste of voiceClient would have got
// wrong, and the part that decides whether a free-tier farmer who photographs an
// invoice is sold something or apologised to.
//
// The other two properties carry over unchanged and are worth restating:
//
//   1. **Nothing here can reach the network.** fetch is a parameter, so a test
//      that forgot the mock would not compile, and one test proves the module
//      never falls back to a global. Every call to this endpoint spends a scan
//      out of a farm's shared monthly allowance, consumed server side before a
//      byte of the image is sent on.
//
//   2. **A 200 is not a success.** The status is a claim about the transport.
//      A body with the wrong kind, or with an amount the model returned as a
//      string, is a failure however cleanly it arrived.
//
// The status table is written out one status at a time rather than derived,
// because it is the copy of the endpoint's contract that this package is allowed
// to hold, and it should read like the contract.

import { describe, expect, it, vi } from 'vitest';
import { t } from './i18n';
import {
  requestReceiptExtraction,
  RECEIPT_MESSAGE_KEYS,
  RECEIPT_PAID_PLAN_REASON,
  type ReceiptExtractionInput,
  type ReceiptFetch,
  type ReceiptFetchInit,
  type ReceiptNextStep,
} from './receiptClient';

// ============================================================
// The injected fetch.
// ============================================================

type FetchStub = {
  status?: number;
  body?: unknown;
  // A body that is not JSON at all, e.g. a captive portal's HTML served with a
  // 200, or a Cloudflare error page on a 502.
  bodyUnreadable?: boolean;
  throws?: unknown;
};

type RecordedCall = { url: string; init: ReceiptFetchInit };

function stubFetch(stub: FetchStub = {}): { fetchImpl: ReceiptFetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];

  const fetchImpl: ReceiptFetch = (url, init) => {
    calls.push({ url, init });
    if (stub.throws !== undefined) return Promise.reject(stub.throws);
    return Promise.resolve({
      status: stub.status ?? 200,
      json: () =>
        stub.bodyUnreadable === true
          ? Promise.reject(new SyntaxError('Unexpected token < in JSON at position 0'))
          : Promise.resolve(stub.body),
    });
  };

  return { fetchImpl, calls };
}

// ============================================================
// The request under test.
//
// Real JPEG magic bytes with a recognisable tail covering both ends of the byte
// range, so "the image went through untouched" is an assertion about content and
// not about length. The endpoint reads the format off exactly these first bytes.
// ============================================================

const IMAGE_BYTES = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01, 0x7f, 0xfe, 0xff];
const IMAGE = new Uint8Array(IMAGE_BYTES).buffer;

const INPUT: ReceiptExtractionInput = {
  workerUrl: 'https://worker.invalid',
  accessToken: 'supabase-access-token-for-tests',
  today: '2026-09-02',
  image: IMAGE,
};

// What the endpoint answers on success: the expense record, no transcript. The
// four fields RECEIPT_JSON_SCHEMA asks the model for; parseVoiceExpense fills
// plotName as null and hasMoreItems as false, which is exactly why the receipt
// schema leaves both out.
const RECEIPT_BODY = {
  kind: 'expense',
  value: {
    name: 'חממות הגליל בע"מ',
    date: '2026-08-30',
    amount: 1450.5,
    confidence: 0.88,
  },
};

// ============================================================
// What goes on the wire.
// ============================================================

describe('receiptClient, the request', () => {
  it('posts to the documented url with the documented query string', async () => {
    const { fetchImpl, calls } = stubFetch({ body: RECEIPT_BODY });

    await requestReceiptExtraction(INPUT, fetchImpl);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://worker.invalid/ai/receipt?today=2026-09-02');
    expect(calls[0]?.init.method).toBe('POST');
  });

  // **The difference from voice, pinned.** The endpoint detects JPEG, PNG and
  // WEBP from the magic bytes, so there is nothing for this client to declare
  // and no way for it to mislabel a file into a 400 the farmer paid to discover.
  it('never sends a format parameter, because the endpoint detects it', async () => {
    const { fetchImpl, calls } = stubFetch({ body: RECEIPT_BODY });

    await requestReceiptExtraction(INPUT, fetchImpl);

    expect(calls[0]?.url).not.toContain('format');
    expect(calls[0]?.url).not.toContain('kind');
  });

  it('sends the access token as a bearer header and never in the url', async () => {
    const { fetchImpl, calls } = stubFetch({ body: RECEIPT_BODY });

    await requestReceiptExtraction(INPUT, fetchImpl);

    expect(calls[0]?.init.headers.Authorization).toBe('Bearer supabase-access-token-for-tests');
    // A token in a query string ends up in every log and proxy on the way.
    expect(calls[0]?.url).not.toContain('supabase-access-token-for-tests');
  });

  // The bytes are the body, not base64 inside a JSON envelope, which would
  // inflate a rural cellular upload of an eight megabyte photograph by a third.
  it('sends the image bytes as the raw body, unchanged', async () => {
    const { fetchImpl, calls } = stubFetch({ body: RECEIPT_BODY });

    await requestReceiptExtraction(INPUT, fetchImpl);

    expect(calls[0]?.init.body).toBe(IMAGE);
    expect([...new Uint8Array(calls[0]?.init.body ?? new ArrayBuffer(0))]).toEqual(IMAGE_BYTES);
  });

  // Android's fetch will not take an ArrayBuffer body without one.
  it('declares an octet-stream content type', async () => {
    const { fetchImpl, calls } = stubFetch({ body: RECEIPT_BODY });

    await requestReceiptExtraction(INPUT, fetchImpl);

    expect(calls[0]?.init.headers['Content-Type']).toBe('application/octet-stream');
  });

  it('does not double the slash when the base url has a trailing one', async () => {
    const { fetchImpl, calls } = stubFetch({ body: RECEIPT_BODY });

    await requestReceiptExtraction({ ...INPUT, workerUrl: 'https://worker.invalid/' }, fetchImpl);

    expect(calls[0]?.url).toBe('https://worker.invalid/ai/receipt?today=2026-09-02');
  });

  it('encodes today rather than pasting it into the url', async () => {
    const { fetchImpl, calls } = stubFetch({ status: 400, body: { error: 'invalid_today' } });

    await requestReceiptExtraction({ ...INPUT, today: '2026-09-02 <script>' }, fetchImpl);

    expect(calls[0]?.url).not.toContain('<script>');
    expect(calls[0]?.url).toContain('today=2026-09-02%20%3Cscript%3E');
  });
});

// ============================================================
// Success.
// ============================================================

describe('receiptClient, success', () => {
  it('returns the expense record the confirmation sheet already knows', async () => {
    const { fetchImpl } = stubFetch({ body: RECEIPT_BODY });

    const result = await requestReceiptExtraction(INPUT, fetchImpl);

    expect(result).toEqual({
      ok: true,
      parsed: {
        kind: 'expense',
        value: {
          amount: 1450.5,
          name: 'חממות הגליל בע"מ',
          // Neither is in the receipt schema, and both come back settled: an
          // invoice names no plot, and one document has one total.
          plotName: null,
          date: '2026-08-30',
          confidence: 0.88,
          hasMoreItems: false,
        },
      },
    });
  });

  // The result has no transcript field at all, rather than one that is always
  // null. A structurally empty field is a promise to fill it one day.
  it('returns no transcript', async () => {
    const { fetchImpl } = stubFetch({ body: RECEIPT_BODY });

    const result = await requestReceiptExtraction(INPUT, fetchImpl);

    expect(Object.keys(result).sort()).toEqual(['ok', 'parsed']);
  });
});

// ============================================================
// **The two 403s.** The block this file exists for.
//
// gate.ts refuses a receipt for two unrelated reasons that share a status, and
// only the reason code separates them. One is an offer to sell the farmer
// something, the other is an apology for something he cannot fix. A client that
// collapsed them — which is exactly what voiceClient.ts does, correctly, because
// on that route only the second is reachable — would tell a paying customer in
// waiting that our app is broken.
// ============================================================

describe('receiptClient, the two 403s', () => {
  it('maps 403 paid plan required to an upgrade offer', async () => {
    const { fetchImpl } = stubFetch({ status: 403, body: { error: RECEIPT_PAID_PLAN_REASON } });

    const result = await requestReceiptExtraction(INPUT, fetchImpl);

    expect(result).toEqual({
      ok: false,
      nextStep: 'upgradePlan',
      messageKey: RECEIPT_MESSAGE_KEYS.upgradePlan,
      reason: 'paid plan required',
      status: 403,
    });
  });

  it('maps 403 no active farm to our bug, not to an upgrade offer', async () => {
    const { fetchImpl } = stubFetch({ status: 403, body: { error: 'no active farm' } });

    const result = await requestReceiptExtraction(INPUT, fetchImpl);

    expect(result).toEqual({
      ok: false,
      nextStep: 'ourBug',
      messageKey: RECEIPT_MESSAGE_KEYS.ourBug,
      reason: 'no active farm',
      status: 403,
    });
  });

  // The same assertion said the way a reader will want it: not two mappings that
  // happen to be right, but two mappings that are different from each other.
  it('the two 403s do not land on the same next step or the same sentence', async () => {
    const paid = stubFetch({ status: 403, body: { error: RECEIPT_PAID_PLAN_REASON } });
    const noFarm = stubFetch({ status: 403, body: { error: 'no active farm' } });

    const unpaid = await requestReceiptExtraction(INPUT, paid.fetchImpl);
    const broken = await requestReceiptExtraction(INPUT, noFarm.fetchImpl);

    expect(unpaid.ok).toBe(false);
    expect(broken.ok).toBe(false);
    expect(unpaid.ok === false && unpaid.nextStep).not.toBe(broken.ok === false && broken.nextStep);
    expect(unpaid.ok === false && unpaid.messageKey).not.toBe(
      broken.ok === false && broken.messageKey,
    );
  });

  // **The safe side to fail on.** A proxy that swallowed the body, an endpoint
  // that grew a third 403, or a reason code that was renamed on the server and
  // not here: none of them is grounds for telling a farmer to upgrade. He may
  // already have paid, and an upgrade offer aimed at a paying customer is worse
  // than an apology aimed at anyone.
  it('a 403 whose reason we cannot read is our bug and never an upgrade offer', async () => {
    const unrecognised: FetchStub[] = [
      { status: 403, bodyUnreadable: true },
      { status: 403, body: null },
      { status: 403, body: {} },
      { status: 403, body: { error: '' } },
      { status: 403, body: { error: 'PAID PLAN REQUIRED' } },
      { status: 403, body: { error: 'paid_plan_required' } },
      { status: 403, body: { error: 'some future refusal' } },
    ];

    for (const stub of unrecognised) {
      const { fetchImpl } = stubFetch(stub);

      const result = await requestReceiptExtraction(INPUT, fetchImpl);

      expect(result.ok === false && result.nextStep, JSON.stringify(stub)).toBe('ourBug');
    }
  });

  // The literal is a second copy of the Worker's PAID_PLAN_REQUIRED, because
  // packages/shared must not import from backend/worker. Pinned so the copy
  // cannot be tidied into a different spelling without a failing test.
  it('matches the exact reason string the Worker sends', () => {
    expect(RECEIPT_PAID_PLAN_REASON).toBe('paid plan required');
  });
});

// ============================================================
// A 200 whose body is not what the endpoint promises.
//
// The endpoint cannot produce any of these, which is exactly why they are
// handled: if one arrives, something between us and it produced it, or this
// client is talking to a version of the endpoint it does not know.
//
// They all land in ourBug and not in retryNow, and that is a quota decision: the
// scan was already paid for by the time the body came back, so sending the
// farmer round again would spend a second one on a fault that is ours.
// ============================================================

describe('receiptClient, hostile 200 bodies', () => {
  const badBodies: { name: string; body?: unknown; unreadable?: boolean; reason: string }[] = [
    { name: 'not json at all', unreadable: true, reason: 'response_not_json' },
    { name: 'null', body: null, reason: 'response_not_an_object' },
    { name: 'an array', body: [RECEIPT_BODY], reason: 'response_not_an_object' },
    { name: 'a bare string', body: 'ok', reason: 'response_not_an_object' },
    { name: 'missing kind', body: { value: RECEIPT_BODY.value }, reason: 'kind_mismatch' },
    {
      name: 'a kind this route cannot produce',
      body: { ...RECEIPT_BODY, kind: 'journal' },
      reason: 'kind_mismatch',
    },
    { name: 'no value at all', body: { kind: 'expense' }, reason: 'value_invalid' },
    // The one that actually happens: a model copying "1,450.50" off the paper
    // and returning it as a string. This is the path that keeps a bogus
    // financial figure out of the farmer's books.
    {
      name: 'an amount that arrived as a string',
      body: { kind: 'expense', value: { ...RECEIPT_BODY.value, amount: '1,450.50' } },
      reason: 'value_invalid',
    },
    {
      name: 'an amount of zero',
      body: { kind: 'expense', value: { ...RECEIPT_BODY.value, amount: 0 } },
      reason: 'value_invalid',
    },
    {
      name: 'a date the model wrote in words',
      body: { kind: 'expense', value: { ...RECEIPT_BODY.value, date: '30 באוגוסט' } },
      reason: 'value_invalid',
    },
  ];

  for (const testCase of badBodies) {
    it(`fails on a 200 body that is ${testCase.name}`, async () => {
      const { fetchImpl } = stubFetch({
        body: testCase.body,
        bodyUnreadable: testCase.unreadable,
      });

      const result = await requestReceiptExtraction(INPUT, fetchImpl);

      expect(result.ok).toBe(false);
      expect(result.ok === false && result.nextStep).toBe('ourBug');
      expect(result.ok === false && result.messageKey).toBe(RECEIPT_MESSAGE_KEYS.ourBug);
      expect(result.ok === false && result.reason).toBe(testCase.reason);
      expect(result.ok === false && result.status).toBe(200);
    });
  }

  // A supplier name is free text and an unreadable one is a legitimate null, so
  // neither may turn a usable scan into a failure. The farmer types the name in
  // one tap on the ledger row; he cannot recover an amount nobody kept.
  it('accepts a receipt whose supplier could not be read', async () => {
    const { fetchImpl } = stubFetch({
      body: { kind: 'expense', value: { ...RECEIPT_BODY.value, name: null } },
    });

    const result = await requestReceiptExtraction(INPUT, fetchImpl);

    expect(result.ok).toBe(true);
    expect(result.ok && result.parsed.value.name).toBeNull();
  });
});

// ============================================================
// Every status the endpoint documents.
// ============================================================

type StatusCase = {
  status: number;
  code: string;
  nextStep: ReceiptNextStep;
  messageKey: string;
};

const DOCUMENTED_STATUSES: StatusCase[] = [
  // 400. Two of the three are his to act on, which is one more than voice has:
  // an empty body, and a file this endpoint cannot read. invalid_today means
  // this client built the request wrong from the device clock.
  {
    status: 400,
    code: 'empty_image',
    nextStep: 'fixPhoto',
    messageKey: RECEIPT_MESSAGE_KEYS.noPhoto,
  },
  {
    status: 400,
    code: 'unsupported_format',
    nextStep: 'fixPhoto',
    messageKey: RECEIPT_MESSAGE_KEYS.unsupportedFile,
  },
  {
    status: 400,
    code: 'invalid_today',
    nextStep: 'ourBug',
    messageKey: RECEIPT_MESSAGE_KEYS.ourBug,
  },
  // 413. An uncompressed photograph over the 8MB cap.
  {
    status: 413,
    code: 'image_too_large',
    nextStep: 'fixPhoto',
    messageKey: RECEIPT_MESSAGE_KEYS.tooLarge,
  },
  // 401, both of the gate's reasons.
  {
    status: 401,
    code: 'missing token',
    nextStep: 'signIn',
    messageKey: RECEIPT_MESSAGE_KEYS.signIn,
  },
  {
    status: 401,
    code: 'invalid token',
    nextStep: 'signIn',
    messageKey: RECEIPT_MESSAGE_KEYS.signIn,
  },
  // 403, both of them, and they are not the same answer.
  {
    status: 403,
    code: RECEIPT_PAID_PLAN_REASON,
    nextStep: 'upgradePlan',
    messageKey: RECEIPT_MESSAGE_KEYS.upgradePlan,
  },
  {
    status: 403,
    code: 'no active farm',
    nextStep: 'ourBug',
    messageKey: RECEIPT_MESSAGE_KEYS.ourBug,
  },
  // 429. The counter shared with voice.
  {
    status: 429,
    code: 'monthly quota exhausted',
    nextStep: 'outOfScans',
    messageKey: RECEIPT_MESSAGE_KEYS.outOfScans,
  },
  // 422, both reason codes. The model answered and we were billed for it, so the
  // photograph has to be taken again rather than sent again.
  {
    status: 422,
    code: 'model_output_unusable',
    nextStep: 'photographAgain',
    messageKey: RECEIPT_MESSAGE_KEYS.photographAgain,
  },
  {
    status: 422,
    code: 'model_output_invalid',
    nextStep: 'photographAgain',
    messageKey: RECEIPT_MESSAGE_KEYS.photographAgain,
  },
  // 500 is only ever a misconfigured deploy, and a missing environment variable
  // will still be missing in a minute.
  {
    status: 500,
    code: 'server_misconfigured',
    nextStep: 'ourBug',
    messageKey: RECEIPT_MESSAGE_KEYS.ourBug,
  },
  // 502 is OpenRouter not answering, which is exactly what resolves on its own.
  {
    status: 502,
    code: 'upstream_unavailable',
    nextStep: 'retryNow',
    messageKey: RECEIPT_MESSAGE_KEYS.retryNow,
  },
];

describe('receiptClient, documented statuses', () => {
  for (const testCase of DOCUMENTED_STATUSES) {
    it(`maps ${testCase.status} ${testCase.code} to ${testCase.nextStep}`, async () => {
      const { fetchImpl } = stubFetch({
        status: testCase.status,
        body: { error: testCase.code },
      });

      const result = await requestReceiptExtraction(INPUT, fetchImpl);

      expect(result).toEqual({
        ok: false,
        nextStep: testCase.nextStep,
        messageKey: testCase.messageKey,
        reason: testCase.code,
        status: testCase.status,
      });
    });
  }

  it('covers every status the endpoint can answer with', () => {
    const covered = new Set(DOCUMENTED_STATUSES.map((testCase) => testCase.status));
    expect([...covered].sort((a, b) => a - b)).toEqual([400, 401, 403, 413, 422, 429, 500, 502]);
  });

  // Every next step has to be reachable, otherwise a branch of the union is dead
  // and the panel has a case nothing ever produces.
  it('reaches every next step', () => {
    const reached = new Set(DOCUMENTED_STATUSES.map((testCase) => testCase.nextStep));
    expect([...reached].sort()).toEqual([
      'fixPhoto',
      'ourBug',
      'outOfScans',
      'photographAgain',
      'retryNow',
      'signIn',
      'upgradePlan',
    ]);
  });

  // The three fixPhoto sentences are three different sentences, because they
  // send the farmer three different ways: photograph again, photograph instead
  // of picking from the gallery, and use the camera rather than that file.
  it('gives the three fixable image faults three different sentences', () => {
    const sentences = DOCUMENTED_STATUSES.filter(
      (testCase) => testCase.nextStep === 'fixPhoto',
    ).map((testCase) => testCase.messageKey);

    expect(sentences).toHaveLength(3);
    expect(new Set(sentences).size).toBe(3);
  });
});

// ============================================================
// Statuses the endpoint never sends, so something else did.
// ============================================================

describe('receiptClient, undocumented statuses', () => {
  // A gateway between us and the Worker. Same meaning as 502.
  for (const status of [503, 504]) {
    it(`treats ${status} as worth trying again`, async () => {
      const { fetchImpl } = stubFetch({ status, body: { error: 'unavailable' } });

      const result = await requestReceiptExtraction(INPUT, fetchImpl);

      expect(result.ok === false && result.nextStep).toBe('retryNow');
      expect(result.ok === false && result.status).toBe(status);
    });
  }

  // A wrong base URL, or a Worker deployed without the route.
  for (const status of [404, 405, 418]) {
    it(`treats ${status} as our bug`, async () => {
      const { fetchImpl } = stubFetch({ status, body: { error: 'nope' } });

      const result = await requestReceiptExtraction(INPUT, fetchImpl);

      expect(result.ok === false && result.nextStep).toBe('ourBug');
    });
  }

  it('still classifies an error status whose body carries no reason', async () => {
    for (const body of [null, 'plain text', {}, { error: '' }, { error: 7 }]) {
      const { fetchImpl } = stubFetch({ status: 429, body });

      const result = await requestReceiptExtraction(INPUT, fetchImpl);

      expect(result.ok === false && result.nextStep, String(body)).toBe('outOfScans');
      expect(result.ok === false && result.reason, String(body)).toBe('no_reason_code');
    }
  });

  it('classifies an error status whose body is not json at all', async () => {
    const { fetchImpl } = stubFetch({ status: 502, bodyUnreadable: true });

    const result = await requestReceiptExtraction(INPUT, fetchImpl);

    expect(result.ok === false && result.nextStep).toBe('retryNow');
    expect(result.ok === false && result.reason).toBe('no_reason_body');
  });
});

// ============================================================
// The network. The request never arrived, so nothing was billed and no quota
// moved. This is the one failure where trying again really is free.
// ============================================================

describe('receiptClient, the network', () => {
  it('catches a thrown fetch and types it as worth retrying', async () => {
    const { fetchImpl } = stubFetch({ throws: new TypeError('Network request failed') });

    const result = await requestReceiptExtraction(INPUT, fetchImpl);

    expect(result).toEqual({
      ok: false,
      nextStep: 'retryNow',
      messageKey: RECEIPT_MESSAGE_KEYS.retryNow,
      reason: 'Network request failed',
      // null and not 0: no answer arrived, so there is no status to report.
      status: null,
    });
  });

  // The mobile edge aborts the upload on a timeout and when the sheet closes,
  // and an abort surfaces here as a thrown fetch.
  it('survives a rejection that is not an Error', async () => {
    const { fetchImpl } = stubFetch({ throws: 'aborted' });

    const result = await requestReceiptExtraction(INPUT, fetchImpl);

    expect(result.ok === false && result.nextStep).toBe('retryNow');
    expect(result.ok === false && result.reason).toBe('aborted');
  });

  // **The promise the whole module rests on.** The global is booby trapped and
  // the call still succeeds, so nothing in this file can bill a real card by
  // forgetting a mock.
  it('never falls back to a global fetch', async () => {
    vi.stubGlobal('fetch', () => {
      throw new Error('the module reached for the global fetch');
    });
    const { fetchImpl, calls } = stubFetch({ body: RECEIPT_BODY });

    const result = await requestReceiptExtraction(INPUT, fetchImpl);

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});

// ============================================================
// The sentences.
//
// t() returns the key itself when there is no Hebrew behind it, so a message key
// that was added to the mapping and forgotten in i18n.ts would put the literal
// string "receipt.error.paidPlan" in front of a farmer. The same guard the
// recording panel's prompt keys already have.
// ============================================================

describe('receiptClient, the message keys', () => {
  it('has Hebrew behind every sentence a result can carry', () => {
    for (const key of Object.values(RECEIPT_MESSAGE_KEYS)) {
      expect(t(key), key).not.toBe(key);
    }
  });

  // Deliberate reuse, pinned so it cannot be undone by accident: these two
  // sentences say the identical thing on both routes, and a second Hebrew copy
  // of either is a second string to keep in step.
  it('reuses voice’s wording for the two sentences that do not mention a route', () => {
    expect(RECEIPT_MESSAGE_KEYS.retryNow).toBe('voice.error.retryNow');
    expect(RECEIPT_MESSAGE_KEYS.ourBug).toBe('voice.error.ourBug');
  });

  // Everything else must not be: a farmer who photographed a receipt should
  // never be told to speak more slowly.
  it('does not borrow a sentence that names the recording', () => {
    const receiptSpecific = [
      RECEIPT_MESSAGE_KEYS.photographAgain,
      RECEIPT_MESSAGE_KEYS.upgradePlan,
      RECEIPT_MESSAGE_KEYS.outOfScans,
      RECEIPT_MESSAGE_KEYS.noPhoto,
      RECEIPT_MESSAGE_KEYS.tooLarge,
      RECEIPT_MESSAGE_KEYS.unsupportedFile,
      RECEIPT_MESSAGE_KEYS.signIn,
    ];
    for (const key of receiptSpecific) {
      expect(key.startsWith('receipt.'), key).toBe(true);
      expect(t(key), key).not.toContain('הקלט');
    }
  });
});
