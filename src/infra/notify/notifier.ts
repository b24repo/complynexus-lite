export interface Message {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Notifier {
  send(msg: Message): Promise<void>;
}

export class NotifyError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'NotifyError';
  }
}

/** Tests: records every message, sends nothing. */
export class NoopNotifier implements Notifier {
  readonly sent: Message[] = [];
  async send(msg: Message): Promise<void> {
    this.sent.push({ ...msg });
  }
}

/** Dev default: prints to/subject/text. `log` is injectable. */
export class ConsoleNotifier implements Notifier {
  constructor(private readonly log: (line: string) => void = console.log) {}
  async send(msg: Message): Promise<void> {
    this.log(`[notify] to=${msg.to} subject=${JSON.stringify(msg.subject)}\n${msg.text}`);
  }
}

export interface ResendOptions {
  apiKey: string;
  from: string;
  timeoutMs?: number;
  endpoint?: string;
}

/** Resend HTTP API without the SDK: POST https://api.resend.com/emails, Bearer auth. */
export class ResendNotifier implements Notifier {
  private readonly timeoutMs: number;
  private readonly endpoint: string;
  constructor(private readonly opts: ResendOptions) {
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.endpoint = opts.endpoint ?? 'https://api.resend.com/emails';
  }
  async send(msg: Message): Promise<void> {
    let res: Response;
    try {
      // fetch is looked up at call time so tests can stub it
      res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.opts.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: this.opts.from,
          to: [msg.to],
          subject: msg.subject,
          text: msg.text,
          ...(msg.html ? { html: msg.html } : {}),
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (cause) {
      const timedOut = cause instanceof Error && cause.name === 'TimeoutError';
      throw new NotifyError(
        timedOut ? `Resend request timed out after ${this.timeoutMs} ms` : 'Resend request failed',
        undefined,
        { cause },
      );
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new NotifyError(`Resend responded ${res.status}: ${body.slice(0, 200)}`, res.status);
    }
  }
}

export function createNotifier(env: NodeJS.ProcessEnv = process.env): Notifier {
  if (env.RESEND_API_KEY && env.MAIL_FROM) {
    return new ResendNotifier({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM });
  }
  return new ConsoleNotifier();
}
