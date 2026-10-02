// Imported first by destructive suites: stops before the app connects to a working database.
import 'dotenv/config';
import { requireDisposableDatabase } from './disposable-db';

requireDisposableDatabase(process.argv[1]?.split(/[\/]/).pop() ?? 'test');
