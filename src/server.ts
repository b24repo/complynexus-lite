import 'dotenv/config';
import { createApp } from './api/app';
import { createDefaultDeps } from './api/deps';

const port = Number(process.env.PORT ?? 3000);
createApp(createDefaultDeps()).listen(port, () => {
  console.log(`ComplyNexus Lite POC listening on ${port}`);
});
