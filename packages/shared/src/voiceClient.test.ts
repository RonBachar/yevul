// Tests for the client side of POST /ai/voice,
// packages/shared/src/voiceClient.ts.
//
// Two properties carry this file, and neither of them is a status code:
//
//   1. **Nothing here can reach the network.** fetch is a parameter of
//      requestVoiceExtraction, so a test that forgot the mock would not
//      compile, and one test additionally proves the module never falls back to
//      a global fetch. Every call to this endpoint spends one of a farm's ten
//      monthly recordings, and that quota is consumed server side before a
//      single byte of audio is sent on.
//
//   2. **A 200 is not a success.** The status is a claim about the transport
//      and nothing else, so the shape tests below matter as much as the status
//      table: a body without a kind, or with a kind that is not the one we
//      asked for, has to come back as a failure.
//
// The status table is written out one status at a time rather than derived,
// because it is the copy of the endpoint's contract that this package is
// allowed to hold, and it should read like the contract.

import { describe, expect, it, vi } from 'vitest';
import {
  deviceToday,
  requestVoiceExtraction,
  VOICE_MESSAGE_KEYS,
  type VoiceExtractionInput,
  type VoiceFetch,
  type VoiceFetchInit,
  type VoiceNextStep,
} from './voiceClient';

// ============================================================
// The injected fetch.
// ============================================================

type FetchStub = {
  status?: number;
  body?: unknown;
  // A body that is not JSON at all, e.g. a proxy error page served with a 200.
  bodyUnreadable?: boolean;
  throws?: unknown;
};

type RecordedCall = { url: string; init: VoiceFetchInit };

function stubFetch(stub: FetchStub = {}): { fetchImpl: VoiceFetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];

  const fetchImpl: VoiceFetch = (url, init) => {
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
// ============================================================

// Recognisable bytes, including both ends of the byte range, so "the body went
// through untouched" is a real assertion and not a length check.
const AUDIO_BYTES = [0, 1, 2, 250, 251, 255];
const AUDIO = new Uint8Array(AUDIO_BYTES).buffer;

const INPUT: VoiceExtractionInput = {
  workerUrl: 'https://worker.invalid',
  accessToken: 'supabase-access-token-for-tests',
  kind: 'expense',
  today: '2026-09-02',
  audio: AUDIO,
};

const EXPENSE_BODY = {
  kind: 'expense',
  transcript: 'קניתי היום דשן בחמש מאות שקל לחלקה הדרומית',
  value: {
    amount: 500,
    name: 'דשן',
    plotName: 'הדרומית',
    date: '2026-09-01',
    confidence: 0.92,
    hasMoreItems: false,
  },
};

const JOURNAL_BODY = {
  kind: 'journal',
  transcript: 'רססתי אתמול את הדרומית במובנטו',
  value: {
    date: '2026-08-31',
    plotName: 'הדרומית',
    type: 'spray',
    note: null,
    sprayPest: 'כנימה',
    sprayMaterial: 'מובנטו',
    sprayDose: 'חצי ליטר',
    sprayPhiDays: 14,
    confidence: 0.81,
  },
};

// ============================================================
// What goes on the wire.
// ============================================================

describe('voiceClient, the request', () => {
  it('posts to the documented url with the documented query string', async () => {
    const { fetchImpl, calls } = stubFetch({ body: EXPENSE_BODY });

    await requestVoiceExtraction(INPUT, fetchImpl);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://worker.invalid/ai/voice?kind=expense&today=2026-09-02');
    expect(calls[0]?.init.method).toBe('POST');
  });

  it('sends the access token as a bearer header and never in the url', async () => {
    const { fetchImpl, calls } = stubFetch({ body: EXPENSE_BODY });

    await requestVoiceExtraction(INPUT, fetchImpl);

    expect(calls[0]?.init.headers.Authorization).toBe('Bearer supabase-access-token-for-tests');
    // A token in a query string ends up in every log and proxy on the way.
    expect(calls[0]?.url).not.toContain('supabase-access-token-for-tests');
  });

  // The bytes are the body, not base64 inside a JSON envelope, which would
  // inflate a rural cellular upload by about a third.
  it('sends the audio bytes as the raw body, unchanged', async () => {
    const { fetchImpl, calls } = stubFetch({ body: EXPENSE_BODY });

    await requestVoiceExtraction(INPUT, fetchImpl);

    expect(calls[0]?.init.body).toBe(AUDIO);
    expect([...new Uint8Array(calls[0]?.init.body ?? new ArrayBuffer(0))]).toEqual(AUDIO_BYTES);
  });

  // Absent means absent: the default lives in the Worker, and sending one from
  // here would make it two defaults to keep in step.
  it('omits format when the caller did not give one', async () => {
    const { fetchImpl, calls } = stubFetch({ body: EXPENSE_BODY });

    await requestVoiceExtraction(INPUT, fetchImpl);

    expect(calls[0]?.url).not.toContain('format');
  });

  it('sends format when the caller gave one', async () => {
    const { fetchImpl, calls } = stubFetch({ body: EXPENSE_BODY });

    await requestVoiceExtraction({ ...INPUT, format: 'wav' }, fetchImpl);

    expect(calls[0]?.url).toBe(
      'https://worker.invalid/ai/voice?kind=expense&today=2026-09-02&format=wav',
    );
  });

  it('does not double the slash when the base url has a trailing one', async () => {
    const { fetchImpl, calls } = stubFetch({ body: EXPENSE_BODY });

    await requestVoiceExtraction({ ...INPUT, workerUrl: 'https://worker.invalid/' }, fetchImpl);

    expect(calls[0]?.url).toBe('https://worker.invalid/ai/voice?kind=expense&today=2026-09-02');
  });

  it('sends the kind it was given, for each of the three', async () => {
    for (const kind of ['expense', 'task', 'journal'] as const) {
      const { fetchImpl, calls } = stubFetch({ status: 502, body: { error: 'x' } });

      await requestVoiceExtraction({ ...INPUT, kind }, fetchImpl);

      expect(calls[0]?.url, kind).toContain(`kind=${kind}`);
    }
  });
});

// ============================================================
// Success.
// ============================================================

describe('voiceClient, success', () => {
  it('returns the parsed record and the transcript', async () => {
    const { fetchImpl } = stubFetch({ body: EXPENSE_BODY });

    const result = await requestVoiceExtraction(INPUT, fetchImpl);

    expect(result).toEqual({
      ok: true,
      transcript: 'קניתי היום דשן בחמש מאות שקל לחלקה הדרומית',
      parsed: { kind: 'expense', value: EXPENSE_BODY.value },
    });
  });

  it('returns a journal record with its spray fields intact', async () => {
    const { fetchImpl } = stubFetch({ body: JOURNAL_BODY });

    const result = await requestVoiceExtraction({ ...INPUT, kind: 'journal' }, fetchImpl);

    expect(result.ok).toBe(true);
    expect(result.ok && result.parsed.value).toMatchObject({
      type: 'spray',
      sprayMaterial: 'מובנטו',
      // The field the regulatory "safe to harvest" date is derived from.
      sprayPhiDays: 14,
    });
  });

  // transcript is display data, so a missing or wrongly typed one is dropped
  // rather than treated as a broken contract. It never reaches the database.
  it('accepts a missing, null, empty or wrongly typed transcript as none', async () => {
    for (const transcript of [undefined, null, '', '   ', 42, { text: 'x' }]) {
      const { fetchImpl } = stubFetch({ body: { ...EXPENSE_BODY, transcript } });

      const result = await requestVoiceExtraction(INPUT, fetchImpl);

      expect(result.ok, String(transcript)).toBe(true);
      expect(result.ok && result.transcript, String(transcript)).toBeNull();
    }
  });

  it('trims the transcript', async () => {
    const { fetchImpl } = stubFetch({ body: { ...EXPENSE_BODY, transcript: '  קניתי דשן  ' } });

    const result = await requestVoiceExtraction(INPUT, fetchImpl);

    expect(result.ok && result.transcript).toBe('קניתי דשן');
  });
});

// ============================================================
// A 200 whose body is not what the endpoint promises.
//
// **This is the block that says a 200 is not a success.** The endpoint cannot
// produce any of these, which is exactly why they have to be handled: if one
// arrives, something between us and the endpoint produced it, or this client is
// talking to a version of the endpoint it does not know.
//
// They all land in ourBug rather than in retryNow, and that is a quota
// decision: the recording was already paid for by the time the body came back,
// so sending the farmer round again would spend a second recording out of ten
// on a fault that is ours and that repeats.
// ============================================================

describe('voiceClient, hostile 200 bodies', () => {
  const badBodies: { name: string; body?: unknown; unreadable?: boolean; reason: string }[] = [
    { name: 'not json at all', unreadable: true, reason: 'response_not_json' },
    { name: 'null', body: null, reason: 'response_not_an_object' },
    { name: 'an array', body: [EXPENSE_BODY], reason: 'response_not_an_object' },
    { name: 'a bare string', body: 'ok', reason: 'response_not_an_object' },
    {
      name: 'missing kind',
      body: { transcript: null, value: EXPENSE_BODY.value },
      reason: 'kind_mismatch',
    },
    {
      name: 'a kind we did not ask for',
      body: { ...EXPENSE_BODY, kind: 'journal' },
      reason: 'kind_mismatch',
    },
    {
      name: 'no value at all',
      body: { kind: 'expense', transcript: null },
      reason: 'value_invalid',
    },
    {
      name: 'a value that fails the validator',
      body: { ...EXPENSE_BODY, value: { ...EXPENSE_BODY.value, amount: -5 } },
      reason: 'value_invalid',
    },
    {
      name: 'a value with a date the model invented',
      body: { ...EXPENSE_BODY, value: { ...EXPENSE_BODY.value, date: 'אתמול' } },
      reason: 'value_invalid',
    },
  ];

  for (const testCase of badBodies) {
    it(`fails on a 200 body that is ${testCase.name}`, async () => {
      const { fetchImpl } = stubFetch({
        body: testCase.body,
        bodyUnreadable: testCase.unreadable,
      });

      const result = await requestVoiceExtraction(INPUT, fetchImpl);

      expect(result.ok).toBe(false);
      expect(result.ok === false && result.nextStep).toBe('ourBug');
      expect(result.ok === false && result.messageKey).toBe(VOICE_MESSAGE_KEYS.ourBug);
      expect(result.ok === false && result.reason).toBe(testCase.reason);
      expect(result.ok === false && result.status).toBe(200);
    });
  }

  // **The one that would be easiest to get wrong.** parseVoiceResult validates
  // against the kind it is handed, so a client that trusted its own kind and
  // ignored the answer's would have read a journal body as an expense, seen
  // amount and date missing, and reported the model as broken instead of the
  // contract.
  it('does not validate a journal body against the expense we asked for', async () => {
    const { fetchImpl } = stubFetch({ body: JOURNAL_BODY });

    const result = await requestVoiceExtraction(INPUT, fetchImpl);

    expect(result.ok === false && result.reason).toBe('kind_mismatch');
  });
});

// ============================================================
// Every status the endpoint documents.
// ============================================================

type StatusCase = {
  status: number;
  code: string;
  nextStep: VoiceNextStep;
  messageKey: string;
};

const DOCUMENTED_STATUSES: StatusCase[] = [
  // 400. Only empty_audio is the farmer's to act on; the other three mean this
  // client built the request wrong.
  {
    status: 400,
    code: 'empty_audio',
    nextStep: 'fixRecording',
    messageKey: VOICE_MESSAGE_KEYS.noSound,
  },
  { status: 400, code: 'invalid_kind', nextStep: 'ourBug', messageKey: VOICE_MESSAGE_KEYS.ourBug },
  { status: 400, code: 'invalid_today', nextStep: 'ourBug', messageKey: VOICE_MESSAGE_KEYS.ourBug },
  {
    status: 400,
    code: 'invalid_format',
    nextStep: 'ourBug',
    messageKey: VOICE_MESSAGE_KEYS.ourBug,
  },
  // 413. Not a malformed request: the recording was simply too long, and the
  // farmer can say it shorter.
  {
    status: 413,
    code: 'audio_too_large',
    nextStep: 'fixRecording',
    messageKey: VOICE_MESSAGE_KEYS.tooLong,
  },
  // 401, both of the gate's reasons.
  {
    status: 401,
    code: 'missing token',
    nextStep: 'signIn',
    messageKey: VOICE_MESSAGE_KEYS.signIn,
  },
  {
    status: 401,
    code: 'invalid token',
    nextStep: 'signIn',
    messageKey: VOICE_MESSAGE_KEYS.signIn,
  },
  // 403. He cannot create himself a farm from a recording screen.
  {
    status: 403,
    code: 'no active farm',
    nextStep: 'ourBug',
    messageKey: VOICE_MESSAGE_KEYS.ourBug,
  },
  // 429. The month's ten are gone; the manual forms still work.
  {
    status: 429,
    code: 'monthly quota exhausted',
    nextStep: 'outOfRecordings',
    messageKey: VOICE_MESSAGE_KEYS.outOfRecordings,
  },
  // 422, both reason codes. Somebody answered and we were billed, so the
  // recording has to be made again rather than sent again.
  {
    status: 422,
    code: 'model_output_unusable',
    nextStep: 'recordAgain',
    messageKey: VOICE_MESSAGE_KEYS.recordAgain,
  },
  {
    status: 422,
    code: 'model_output_invalid',
    nextStep: 'recordAgain',
    messageKey: VOICE_MESSAGE_KEYS.recordAgain,
  },
  // 500 is only ever a misconfigured deploy, and a missing environment variable
  // will still be missing in a minute.
  {
    status: 500,
    code: 'server_misconfigured',
    nextStep: 'ourBug',
    messageKey: VOICE_MESSAGE_KEYS.ourBug,
  },
  // 502 is OpenRouter not answering, which is exactly what does resolve on its
  // own. This split is the reason the Worker keeps the two statuses apart.
  {
    status: 502,
    code: 'upstream_unavailable',
    nextStep: 'retryNow',
    messageKey: VOICE_MESSAGE_KEYS.retryNow,
  },
];

describe('voiceClient, documented statuses', () => {
  for (const testCase of DOCUMENTED_STATUSES) {
    it(`maps ${testCase.status} ${testCase.code} to ${testCase.nextStep}`, async () => {
      const { fetchImpl } = stubFetch({
        status: testCase.status,
        body: { error: testCase.code },
      });

      const result = await requestVoiceExtraction(INPUT, fetchImpl);

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

  // Every next step has to be reachable, otherwise a branch of the union is
  // dead and the screen has a case nothing ever produces.
  it('reaches every next step', () => {
    const reached = new Set(DOCUMENTED_STATUSES.map((testCase) => testCase.nextStep));
    expect([...reached].sort()).toEqual([
      'fixRecording',
      'ourBug',
      'outOfRecordings',
      'recordAgain',
      'retryNow',
      'signIn',
    ]);
  });
});

// ============================================================
// Statuses the endpoint never sends, so something else did.
// ============================================================

describe('voiceClient, undocumented statuses', () => {
  // A gateway between us and the Worker. Same meaning as 502.
  for (const status of [503, 504]) {
    it(`treats ${status} as worth trying again`, async () => {
      const { fetchImpl } = stubFetch({ status, body: { error: 'unavailable' } });

      const result = await requestVoiceExtraction(INPUT, fetchImpl);

      expect(result.ok === false && result.nextStep).toBe('retryNow');
      expect(result.ok === false && result.status).toBe(status);
    });
  }

  // A wrong base URL, or a Worker deployed without the route. Trying again is
  // pointless and it is not the farmer's mistake.
  for (const status of [404, 405, 418]) {
    it(`treats ${status} as our bug`, async () => {
      const { fetchImpl } = stubFetch({ status, body: { error: 'nope' } });

      const result = await requestVoiceExtraction(INPUT, fetchImpl);

      expect(result.ok === false && result.nextStep).toBe('ourBug');
    });
  }

  it('still classifies an error status whose body carries no reason', async () => {
    for (const body of [null, 'plain text', {}, { error: '' }, { error: 7 }]) {
      const { fetchImpl } = stubFetch({ status: 429, body });

      const result = await requestVoiceExtraction(INPUT, fetchImpl);

      expect(result.ok === false && result.nextStep, String(body)).toBe('outOfRecordings');
      expect(result.ok === false && result.reason, String(body)).toBe('no_reason_code');
    }
  });

  it('classifies an error status whose body is not json at all', async () => {
    const { fetchImpl } = stubFetch({ status: 502, bodyUnreadable: true });

    const result = await requestVoiceExtraction(INPUT, fetchImpl);

    expect(result.ok === false && result.nextStep).toBe('retryNow');
    expect(result.ok === false && result.reason).toBe('no_reason_body');
  });
});

// ============================================================
// The network. The request never arrived, so nothing was billed and no quota
// moved. This is the one failure where trying again really is free.
// ============================================================

describe('voiceClient, the network', () => {
  it('catches a thrown fetch and types it as worth retrying', async () => {
    const { fetchImpl } = stubFetch({ throws: new TypeError('Network request failed') });

    const result = await requestVoiceExtraction(INPUT, fetchImpl);

    expect(result).toEqual({
      ok: false,
      nextStep: 'retryNow',
      messageKey: VOICE_MESSAGE_KEYS.retryNow,
      reason: 'Network request failed',
      // null and not 0: no answer arrived, so there is no status to report.
      status: null,
    });
  });

  it('survives a rejection that is not an Error', async () => {
    const { fetchImpl } = stubFetch({ throws: 'aborted' });

    const result = await requestVoiceExtraction(INPUT, fetchImpl);

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
    const { fetchImpl, calls } = stubFetch({ body: EXPENSE_BODY });

    const result = await requestVoiceExtraction(INPUT, fetchImpl);

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});

// ============================================================
// deviceToday.
//
// **The regression this block exists for is one day, in one direction.** The
// Worker runs in UTC, which is why today is client supplied at all, and an
// implementation written with toISOString() would hand it the UTC day and put
// the bug straight back: the farmer who says "yesterday" at 22:00 in Israel
// would have it resolved a day early, into his books.
//
// **The device is simulated rather than the test runner moved.** Forcing a
// timezone from inside a test means writing process.env.TZ, and that silently
// does nothing when vitest runs the file in a worker thread, which would leave
// this whole block passing only on a machine already set to Israel. deviceIn
// below is a real Date whose local getters answer as a device in a given
// timezone would, so every assertion here holds wherever the suite runs.
// ============================================================

function deviceIn(instantUtc: string, year: number, month: number, day: number): Date {
  return Object.assign(new Date(instantUtc), {
    getFullYear: () => year,
    getMonth: () => month - 1,
    getDate: () => day,
  });
}

describe('deviceToday', () => {
  // 2026-09-02T21:30:00Z is already 2026-09-03, half past midnight, on a phone
  // in Israel. **This is the exact instant the field exists for**, and
  // toISOString() would call it September 2.
  it('returns the local day where the UTC day is still yesterday', () => {
    const instant = deviceIn('2026-09-02T21:30:00Z', 2026, 9, 3);

    expect(instant.toISOString().slice(0, 10)).toBe('2026-09-02');
    expect(deviceToday(instant)).toBe('2026-09-03');
  });

  // The same bug in the other direction, for a device west of UTC:
  // 2026-09-02T05:00:00Z is still the evening of September 1 in Hawaii.
  it('returns the local day where the UTC day is already tomorrow', () => {
    const instant = deviceIn('2026-09-02T05:00:00Z', 2026, 9, 1);

    expect(instant.toISOString().slice(0, 10)).toBe('2026-09-02');
    expect(deviceToday(instant)).toBe('2026-09-01');
  });

  // An ordinary Date, built from local parts so the expectation holds in any
  // timezone. Single digit months and days are padded, because the endpoint
  // rejects anything that is not exactly YYYY-MM-DD.
  it('pads the month and the day to two digits', () => {
    expect(deviceToday(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });

  it('produces the format the endpoint accepts, with no argument at all', () => {
    expect(deviceToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
