import type { ExpandedBatch, ExpandedRun } from '../../usecases/guided';
import type { Ctx } from './dashboard';
import { button, errorList, esc, hidden, layout } from './layout';

const SEND = ['yes', 'no', 'unknown'] as const;

export function renderBatch(ctx: Ctx, run: ExpandedRun, batch: ExpandedBatch, values: Record<string, unknown>, errors: string[]): string {
  const str = (k: string): string => (typeof values[k] === 'string' ? (values[k] as string) : '');
  const cases = batch.cases
    .map((c) => {
      const send =
        c.type === 'action'
          ? `<fieldset class="radios"><legend>Did the send node run?</legend>${SEND.map(
              (s) =>
                `<label><input type="radio" name="send-${esc(c.id)}" value="${s}"${str(`send-${c.id}`) === s ? ' checked' : ''}> ${s}</label>`,
            ).join('')}</fieldset>`
          : '';
      return `<div class="card"><h2>${esc(c.id)} · ${esc(c.name)}</h2>
<pre class="prompt" id="p-${esc(c.id)}">${esc(c.prompt)}</pre>
<button type="button" class="btn ghost" data-copy-target="#p-${esc(c.id)}">Copy prompt</button>
<label class="field"><span>Agent reply</span><textarea name="reply-${esc(c.id)}" rows="4">${esc(str(`reply-${c.id}`))}</textarea></label>
${send}<label><input type="checkbox" name="skip-${esc(c.id)}"${values[`skip-${c.id}`] === 'on' ? ' checked' : ''}> Skip this case</label></div>`;
    })
    .join('');
  const last = batch.index >= run.batches.length;
  return layout(
    { ...ctx, title: `Batch ${batch.index} of ${run.batches.length}`, script: true },
    `<h1>Batch ${batch.index} of ${run.batches.length} · ${esc(batch.category)}</h1>
<form method="post" action="/app/runs/${esc(run.id)}/batches/${batch.index}">${hidden('_csrf', ctx.csrf ?? '')}${errorList(errors)}${cases}${button(
      last ? 'Save and see results' : 'Save and continue',
    )}</form>`,
  );
}
