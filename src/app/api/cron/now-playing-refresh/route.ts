import { NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';

import { logger } from '@/lib/sentry/logger';
import { withSentrySpan } from '@/lib/sentry/withSpan';
import { withSentryTransaction } from '@/lib/sentry/withTransaction';
import { refreshNowPlayingCatalog } from '../../../../../prisma/seed';

export const dynamic = 'force-dynamic';

// ✅ your core logic extracted for reuse
async function handler() {
    const cronLogger = logger.scope('api:cron:catalog-refresh');

    try {
        return await withSentryTransaction(
            'cron:catalog-refresh',
            async () => {
                await withSentrySpan('job.step', 'Execute catalog refresh script', async () => {
                    cronLogger.info('Starting DB now playing movies catalog refresh');
                    await refreshNowPlayingCatalog({ wrapWithTransaction: false });
                    cronLogger.info('Prisma catalog refresh completed');
                });

                return NextResponse.json({ ok: true });
            },
            { op: 'cron' },
        );
    } catch (error) {
        cronLogger.error('Catalog refresh cron failed', error as Error);
        return NextResponse.json({ ok: false, error: 'failed' }, { status: 500 });
    }
}

// ✅  use signature verification in prod, bypass locally
export const POST = process.env.NODE_ENV === 'production' ? verifySignatureAppRouter(handler) : handler;

// Optional: allow GET for manual local testing
export const GET = handler;
