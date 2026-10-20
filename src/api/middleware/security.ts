import helmet from 'helmet';

// The verify page loads the Google Fonts stylesheet and uses inline styles; it has no inline scripts.
// The /app pages load the same-origin /app/static/app.js (script-src 'self' from helmet defaults) and have no inline scripts or handlers.
export const security = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
      'img-src': ["'self'", 'data:'],
      'upgrade-insecure-requests': null,
    },
  },
});
