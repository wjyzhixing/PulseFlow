import { buildApp } from './app.js';
import { parsePort } from './port.js';

const port = parsePort(process.env.PORT);
const app = buildApp();

app.listen({ port, host: '0.0.0.0' }).catch((error: unknown) => {
  app.log.error(error);
  process.exitCode = 1;
});
