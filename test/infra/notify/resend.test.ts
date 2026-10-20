import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotifyError, ResendNotifier } from '../../../src/infra/notify/notifier';

const msg = { to: 'a@example.com', subject: 'Hi', text: 'Body', html: '<p>Body</p>' };
let fetchMock: ReturnType<typeof vi.fn>;

function make(timeoutMs?: number) {
  return new ResendNotifier({ apiKey: 'key123', from: 'Me <me@example.com>', timeoutMs });
}

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response('{"id":"1"}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('ResendNotifier', () => {
  it('posts to the Resend API with auth and payload', async () => {
    await make().send(msg);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer key123');
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'Me <me@example.com>',
      to: ['a@example.com'],
      subject: 'Hi',
      text: 'Body',
      html: '<p>Body</p>',
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('omits html when not given', async () => {
    await make().send({ to: 'a@example.com', subject: 'Hi', text: 'Body' });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).not.toHaveProperty('html');
  });

  it('throws NotifyError with status on 4xx', async () => {
    fetchMock.mockResolvedValue(new Response('{"message":"bad"}', { status: 422 }));
    const err = await make().send(msg).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotifyError);
    expect((err as NotifyError).status).toBe(422);
    expect((err as NotifyError).message).toContain('bad');
  });

  it('throws NotifyError with status on 5xx', async () => {
    fetchMock.mockResolvedValue(new Response('oops', { status: 503 }));
    const err = await make().send(msg).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotifyError);
    expect((err as NotifyError).status).toBe(503);
  });

  it('throws NotifyError on timeout', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener('abort', () => reject(init.signal!.reason));
        }),
    );
    const err = await make(20).send(msg).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotifyError);
    expect((err as NotifyError).message).toMatch(/timed out/);
  });

  it('wraps network errors with the cause', async () => {
    const cause = new TypeError('fetch failed');
    fetchMock.mockRejectedValue(cause);
    const err = await make().send(msg).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotifyError);
    expect((err as NotifyError).cause).toBe(cause);
    expect((err as NotifyError).status).toBeUndefined();
  });
});
