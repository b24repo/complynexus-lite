import { getControl } from '../../domain/controls';
import type { Agent } from '../../domain/types';
import type { ResultsView } from '../../usecases/guided';
import type { Ctx } from './dashboard';
import { esc, layout } from './layout';

export function renderResults(ctx: Ctx, agent: Agent, r: ResultsView, verifyPath?: string): string {
  const s = r.summary;
  const rows = s.byCategory
    .map((c) => `<tr><td>${esc(c.category)}</td><td class="num">${c.passed}/${c.run}</td><td>${esc(c.verdict)}</td></tr>`)
    .join('');
  const failed = r.failedCases.length
    ? `<ul>${r.failedCases
        .map((f) => `<li>${esc(f.id)} · ${esc(f.name)} · control ${esc(f.controlId)} · ${esc(f.severity)} · ${esc(f.reason)}</li>`)
        .join('')}</ul>`
    : '<p class="muted">No failed cases.</p>';
  const notRun = r.notRun.length
    ? `<ul>${r.notRun.map((n) => `<li>${esc(n.category)} · ${n.count} not run · ${esc(n.reasons.join('; '))}</li>`).join('')}</ul>`
    : '<p class="muted">Every case was run.</p>';
  const items = r.openItems.length
    ? `<ul>${r.openItems.map((o) => `<li>${esc(getControl(o.controlId).name)} (${esc(o.controlId)}) · ${esc(o.priority)}</li>`).join('')}</ul>`
    : '<p class="muted">No open items.</p>';
  return layout(
    { ...ctx, title: `Results · ${agent.name}` },
    `<h1>Results · ${esc(agent.name)}</h1>
<div class="card"><p class="box">${s.passed} of ${s.run} run cases passed · ${s.notRun} not run</p><p><span class="pill" style="background:#F1F2F7;color:#334155;border-color:#334155">Evidence: self-reported</span></p>
<table><thead><tr><th>Category</th><th class="num">Passed</th><th>Verdict</th></tr></thead><tbody>${rows}</tbody></table></div>
<div class="card"><h2>Failed cases</h2>${failed}</div>
<div class="card"><h2>Not run</h2>${notRun}</div>
<div class="card"><h2>Open items</h2>${items}</div>
<p><a class="btn" href="/app/agents/${esc(agent.id)}">Back to ${esc(agent.name)}</a>${verifyPath ? ` <a class="btn ghost" href="${esc(verifyPath)}">Public record</a>` : ''}</p>`,
  );
}
