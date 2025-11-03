import * as Sentry from '@sentry/nextjs';

type LogLevel = 'debug' | 'info' | 'warning' | 'error';

const isProduction = process.env.NODE_ENV === 'production';

const consoleLogger: Record<LogLevel, (message?: unknown, ...optionalParams: unknown[]) => void> = {
    debug: console.debug.bind(console),
    info: console.info.bind(console),
    warning: console.warn.bind(console),
    error: console.error.bind(console),
};

const levelLabels: Record<LogLevel, string> = {
    debug: '[DEBUG]',
    info: '[INFO]',
    warning: '[WARNING]',
    error: '[ERROR]',
};

const normaliseExtra = (extra?: Record<string, unknown> | Error) => {
    if (!extra) {
        return undefined;
    }

    if (extra instanceof Error) {
        return {
            name: extra.name,
            message: extra.message,
            stack: extra.stack,
        };
    }

    return extra;
};

function baseLog(level: LogLevel, message: string, scope?: string, extra?: Record<string, unknown> | Error) {
    const prefixedMessage = scope ? `[${scope}] ${message}` : message;
    const normalizedExtra = normaliseExtra(extra);

    // Local console output (always in dev; optional in prod)
    const logger = consoleLogger[level];
    if (!isProduction) {
        logger(`${levelLabels[level]} ${prefixedMessage}`, extra ?? '');
    }

    // In production, capture only warnings & errors as full Sentry events
    if (isProduction) {
        if (level === 'error') {
            if (extra instanceof Error) {
                Sentry.captureException(extra, {
                    level,
                    tags: scope ? { scope } : undefined,
                    extra: normalizedExtra,
                });
            } else {
                Sentry.captureMessage(prefixedMessage, {
                    level,
                    tags: scope ? { scope } : undefined,
                    extra: normalizedExtra,
                });
            }
        } else if (level === 'warning') {
            Sentry.captureMessage(prefixedMessage, {
                level,
                tags: scope ? { scope } : undefined,
                extra: normalizedExtra,
            });
        }
        // info/debug → no captureMessage (breadcrumb only)
    }

    // Always add breadcrumb for context (executed last)
    try {
        Sentry.addBreadcrumb({
            category: scope ?? 'app',
            message: prefixedMessage,
            level,
            data: normalizedExtra,
        });
    } catch (err) {
        // silently ignore breadcrumb failures
        console.warn('[LOGGER] Failed to add breadcrumb', err);
    }
}

export const logger = {
    debug: (message: string, extra?: Record<string, unknown>) => baseLog('debug', message, undefined, extra),
    info: (message: string, extra?: Record<string, unknown>) => baseLog('info', message, undefined, extra),
    warn: (message: string, extra?: Record<string, unknown>) => baseLog('warning', message, undefined, extra),
    error: (message: string, extra?: Record<string, unknown> | Error) => baseLog('error', message, undefined, extra),
    scope(scope: string) {
        return {
            debug: (message: string, extra?: Record<string, unknown>) => baseLog('debug', message, scope, extra),
            info: (message: string, extra?: Record<string, unknown>) => baseLog('info', message, scope, extra),
            warn: (message: string, extra?: Record<string, unknown>) => baseLog('warning', message, scope, extra),
            error: (message: string, extra?: Record<string, unknown> | Error) =>
                baseLog('error', message, scope, extra),
        };
    },
};
