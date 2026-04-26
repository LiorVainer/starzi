import type { Prisma } from '@prisma/client';

const DEFAULT_BATCH_SIZE = 400;
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 250;

export type ChunkableArray<T> = readonly T[] | T[];

export function chunkArray<T>(items: ChunkableArray<T>, chunkSize: number = DEFAULT_BATCH_SIZE): T[][] {
    if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
        throw new Error('chunkSize must be a positive number');
    }

    const source = Array.isArray(items) ? items : Array.from(items);
    if (!source.length) return [];

    const chunks: T[][] = [];
    for (let i = 0; i < source.length; i += chunkSize) {
        chunks.push(source.slice(i, i + chunkSize));
    }

    return chunks;
}

export function buildIdMap<T, K extends PropertyKey>(items: ChunkableArray<T>, keySelector: (item: T) => K): Map<K, T> {
    const map = new Map<K, T>();
    for (const item of items) {
        const key = keySelector(item);
        if (key === undefined || key === null) continue;
        map.set(key, item);
    }
    return map;
}

export type DiffPredicate<T> = (incoming: T, existing: T) => boolean;

export type DiffResult<T> = {
    toInsert: T[];
    toUpdate: Array<{ incoming: T; existing: T }>;
    toSkip: T[];
};

export function diffExisting<T, K extends PropertyKey>(params: {
    existingMap: Map<K, T>;
    incoming: ChunkableArray<T>;
    keySelector: (item: T) => K;
    hasChanged?: DiffPredicate<T>;
}): DiffResult<T> {
    const { existingMap, incoming, keySelector, hasChanged } = params;
    const inserts: T[] = [];
    const updates: Array<{ incoming: T; existing: T }> = [];
    const skips: T[] = [];

    for (const candidate of incoming) {
        const key = keySelector(candidate);
        if (!existingMap.has(key)) {
            inserts.push(candidate);
            continue;
        }

        const current = existingMap.get(key)!;
        if (hasChanged?.(candidate, current)) {
            updates.push({ incoming: candidate, existing: current });
            continue;
        }

        skips.push(candidate);
    }

    return { toInsert: inserts, toUpdate: updates, toSkip: skips };
}

type BatchExecutorContext<TChunk> = {
    chunk: TChunk[];
    chunkIndex: number;
    totalChunks: number;
};

type BatchExecutor<T> = (context: BatchExecutorContext<T>) => Promise<void>;

type BatchOptions = {
    chunkSize?: number;
};

export async function batchInsert<T>(items: ChunkableArray<T>, executor: BatchExecutor<T>, options?: BatchOptions) {
    await batchProcess(items, executor, options);
}

export async function batchUpsert<T>(items: ChunkableArray<T>, executor: BatchExecutor<T>, options?: BatchOptions) {
    await batchProcess(items, executor, options);
}

async function batchProcess<T>(items: ChunkableArray<T>, executor: BatchExecutor<T>, options?: BatchOptions) {
    const chunkSize = options?.chunkSize ?? DEFAULT_BATCH_SIZE;
    const chunks = chunkArray(items, chunkSize);

    for (let index = 0; index < chunks.length; index += 1) {
        await executor({
            chunk: chunks[index],
            chunkIndex: index,
            totalChunks: chunks.length,
        });
    }
}

export type RetryOptions = {
    attempts?: number;
    delayMs?: number;
    onRetry?: (attempt: number, error: unknown) => void;
};

export async function retry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
    const attempts = options?.attempts ?? DEFAULT_RETRY_ATTEMPTS;
    const delayMs = options?.delayMs ?? DEFAULT_RETRY_DELAY_MS;

    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt === attempts) break;
            options?.onRetry?.(attempt, error);
            await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
        }
    }

    throw lastError;
}

export function pickPrismaData<T>(payload: T): Prisma.JsonValue {
    return JSON.parse(JSON.stringify(payload)) as Prisma.JsonValue;
}
