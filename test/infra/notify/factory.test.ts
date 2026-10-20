import { describe, expect, it, vi } from 'vitest';
import { ConsoleNotifier, NoopNotifier, ResendNotifier, createNotifier } from '../../../src/infra/notify/notifier';

describe('createNotifier', () => {
  it('returns ConsoleNotifier when RESEND_API_KEY is unset', () => {
    expect(createNotifier({ MAIL_FROM: 'x@example.com' })).toBeInstanceOf(ConsoleNotifier);
  });

  it('returns ConsoleNotifier when MAIL_FROM is missing', () => {
    expect(createNotifier({ RESEND_API_KEY: 'k' })).toBeInstanceOf(ConsoleNotifier);
  });

  it('returns ResendNotifier when both are set', () => {
    expect(createNotifier({ RESEND_API_KEY: 'k', MAIL_FROM: 'x@example.com' })).toBeInstanceOf(ResendNotifier);
  });
});

describe('Noop and Console notifiers', () => {
  it('NoopNotifier records messages', async () => {
    const n = new NoopNotifier();
    await n.send({ to: 'a@example.com', subject: 'S', text: 'T' });
    expect(n.sent).toEqual([{ to: 'a@example.com', subject: 'S', text: 'T' }]);
  });

  it('ConsoleNotifier logs once with to and subject', async () => {
    const log = vi.fn();
    await new ConsoleNotifier(log).send({ to: 'a@example.com', subject: 'S', text: 'T' });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain('a@example.com');
    expect(log.mock.calls[0][0]).toContain('"S"');
  });
});
