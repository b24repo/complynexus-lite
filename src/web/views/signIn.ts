import { button, esc, field, layout } from './layout';

interface Ctx {
  publicHost?: string;
  error?: string;
}

export function renderSignIn(ctx: Ctx): string {
  return layout(
    { title: 'Sign in', publicHost: ctx.publicHost },
    `<div class="card"><h1>Sign in</h1><p>We email you a link; no password.</p>
<form method="post" action="/auth/magic-link">
${field('Email', '<input type="email" name="email" required autocomplete="email">', ctx.error)}
${button('Email me a sign-in link')}
</form></div>`,
  );
}

export function renderSignInSent(ctx: Ctx): string {
  return layout(
    { title: 'Check your email', publicHost: ctx.publicHost },
    `<div class="card"><h1>Check your email</h1>
<p>If that address is known to us, a sign-in link is on its way. It works once and expires in 15 minutes.</p>
<p class="muted">Running locally? The link is printed in the server console.</p>
<p><a href="/app/sign-in">${esc('Back to sign in')}</a></p></div>`,
  );
}
