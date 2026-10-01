import { PrismaClient, Prisma } from '@prisma/client';
import { executeOperation } from '../common/request-operation';
import { withCommitHooks } from '../common/after-commit';

type TxDecorator = (tx: Prisma.TransactionClient) => Prisma.TransactionClient;
let txDecorator: TxDecorator | null = null;

/** Lets the app wrap every interactive transaction's client (admin notifications from audit
 * writes), registered from app.ts so this module stays free of business imports. */
export function decorateTransactions(decorator: TxDecorator) {
  txDecorator = decorator;
}

function createClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
  });
  const transaction = client.$transaction.bind(client);
  // onCommit callbacks (realtime broadcasts) run only after the transaction committed.
  client.$transaction = ((action: any, options?: any) => typeof action === 'function'
    ? withCommitHooks(() => transaction((tx) => executeOperation(txDecorator ? txDecorator(tx) : tx, action), options))
    : transaction(action, options)) as typeof client.$transaction;
  return client;
}

class PrismaService {
  private static instance: ReturnType<typeof createClient>;

  public static getInstance() {
    if (!PrismaService.instance) {
      PrismaService.instance = createClient();
    }
    return PrismaService.instance;
  }
}

export const prisma = PrismaService.getInstance();

// Money stays Decimal throughout database reads and transactions.
export type TransactionClient = Prisma.TransactionClient;
