import type { RecordStatus } from '../../domain/types';

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export type PillStatus = RecordStatus | 'Not assessed';

interface PillStyle {
  bg: string;
  fg: string;
  label: string;
}

export const PILLS: Record<PillStatus, PillStyle> = {
  Assessed: {
    bg: '#F0F0FF',
    fg: '#3D3FD6',
    label: 'Assessed · not yet tested',
  },
  Current: { bg: '#DCFCE7', fg: '#166534', label: 'Current' },
  'Re-test due': { bg: '#FEF3C7', fg: '#92400E', label: 'Re-test due' },
  Expired: { bg: '#F1F2F7', fg: '#334155', label: 'Expired' },
  Revoked: { bg: '#FEE2E2', fg: '#991B1B', label: 'Revoked' },
  'Not assessed': { bg: '#F1F2F7', fg: '#5B5E7A', label: 'Not assessed' },
};

export function pill(status: PillStatus): string {
  const p = PILLS[status];
  return `<span class="pill" style="background:${p.bg};color:${p.fg};border-color:${p.fg}">${esc(p.label)}</span>`;
}

export interface LayoutOpts {
  title: string;
  founderEmail?: string;
  csrf?: string;
  publicHost?: string;
  script?: boolean;
}

export function hidden(name: string, value: string): string {
  return `<input type="hidden" name="${esc(name)}" value="${esc(value)}">`;
}

export function button(
  label: string,
  opts: {
    kind?: 'primary' | 'ghost';
    type?: 'submit' | 'button';
    attrs?: string;
  } = {},
): string {
  const cls = opts.kind === 'ghost' ? 'btn ghost' : 'btn';
  return `<button type="${opts.type ?? 'submit'}" class="${cls}"${opts.attrs ? ` ${opts.attrs}` : ''}>${esc(label)}</button>`;
}

/** `control` is trusted markup built by the caller (with esc() on every interpolated value). */
export function field(label: string, control: string, error?: string): string {
  return `<label class="field"><span>${esc(label)}</span>${control}${error ? `<em class="err">${esc(error)}</em>` : ''}</label>`;
}

export function errorList(issues: string[]): string {
  if (issues.length === 0) return '';
  return `<div class="flash err" role="alert"><ul>${issues.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`;
}

const CSS = `body{margin:0;background:#F7F7FC;font-family:'Lexend',system-ui,sans-serif;color:#1F2040}a{color:#4446E0}
header{background:#fff;border-bottom:1px solid #E4E5F5;padding:14px 20px;display:flex;align-items:center;gap:10px}
header form{margin-left:auto}main{max-width:640px;margin:24px auto;padding:0 16px}
.card{background:#fff;border:1px solid #E4E5F5;border-radius:12px;padding:24px;margin-bottom:16px}
.pill{display:inline-block;padding:4px 12px;font-size:14px;font-weight:600;border-radius:999px;border:2px solid}
.box{margin-top:16px;padding:12px 14px;background:#F7F7FC;border:1px solid #E4E5F5;border-radius:8px;font-size:14px}
.btn{display:inline-block;padding:10px 16px;border-radius:8px;border:1px solid #4446E0;background:#4446E0;color:#fff;font:inherit;cursor:pointer;text-decoration:none}
.btn.ghost{background:#fff;color:#4446E0}.field{display:block;margin:12px 0}.field>span{display:block;font-size:13px;color:#5B5E7A;margin-bottom:4px}
input[type=text],input[type=email],input[type=number],select,textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid #C9CBE3;border-radius:8px;font:inherit}
.err{color:#991B1B;font-size:13px}.flash.err{background:#FEE2E2;border:1px solid #991B1B;border-radius:8px;padding:10px 14px;margin-bottom:12px}
.muted{color:#5B5E7A;font-size:13px}pre.prompt{white-space:pre-wrap;background:#F7F7FC;border:1px solid #E4E5F5;border-radius:8px;padding:12px;font:inherit}
fieldset{border:0;padding:0;margin:12px 0}legend{font-weight:600}.radios label{display:inline-block;margin-right:12px}
ul.agents{list-style:none;padding:0}.actions{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}
@media (max-width:420px){main{margin:12px auto}.card{padding:16px}}`;

export function layout(opts: LayoutOpts, body: string): string {
  const signOut = opts.founderEmail
    ? `<form method="post" action="/auth/logout"><span class="muted">${esc(opts.founderEmail)}</span> ${button('Sign out', { kind: 'ghost' })}</form>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)} · ComplyNexus Lite</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<header><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#595BFF"/></svg><strong><a href="/app" style="color:inherit;text-decoration:none">ComplyNexus</a></strong><span class="muted">${esc(opts.publicHost ?? '')}</span>
${signOut}</header>
<main>${body}</main>
${opts.script ? '<script src="/app/static/app.js" defer></script>' : ''}
</body>
</html>
`;
}
