// Serves the API alone on DATABASE_URL (already migrated and seeded by the caller) and prints
// "LISTENING <port>". Used by integration suites that need one app per disposable schema.
import 'dotenv/config';

const { app } = await import('../server/src/app');
const server = app.listen(Number(process.env.PORT || 0), '127.0.0.1', () => {
  const address = server.address() as import('node:net').AddressInfo;
  console.log(`LISTENING ${address.port}`);
});
const stop = () => server.close(() => process.exit(0));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
