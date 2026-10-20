import helmet from 'helmet';

// The verify page loads the Google Fonts stylesheet and uses inline styles; it has no inline scripts.
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
