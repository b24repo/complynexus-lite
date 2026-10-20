import { esc, layout } from './layout';

export interface ErrorCtx {
  founderEmail?: string;
  publicHost?: string;
}

export function renderError(ctx: ErrorCtx, status: number, message: string): string {
  const title = status === 404 ? 'Not found' : 'Something went wrong';
  return layout(
    { title, ...ctx },
    `<div class="card"><h1>${esc(title)}</h1><p>${esc(message)}</p><p><a href="/app">Back to dashboard</a></p></div>`,
  );
}
