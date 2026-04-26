import { Language, Prisma, PrismaClient } from '@prisma/client';
import { chunkArray } from '@/lib/ingestion/utils';

const MAX_BATCH = 400;

export class ActorsDAL {
    constructor(private prisma: PrismaClient) {}

    async upsertBase(data: Omit<Prisma.ActorCreateInput, 'translations' | 'cast'>) {
        return this.prisma.actor.upsert({
            where: { imdbId: data.imdbId },
            create: data,
            update: data,
        });
    }

    async upsertActorsBulk(entries: Prisma.ActorCreateManyInput[], chunkSize = MAX_BATCH) {
        const chunks = chunkArray(entries, chunkSize);
        for (const chunk of chunks) {
            await this.prisma.actor.createMany({ data: chunk, skipDuplicates: true });
        }
    }

    async updateActorsBulk(entries: Prisma.ActorUpdateManyArgs[], chunkSize = MAX_BATCH) {
        const chunks = chunkArray(entries, chunkSize);
        for (const chunk of chunks) {
            await Promise.all(chunk.map((args) => this.prisma.actor.updateMany(args)));
        }
    }

    async findManyByTmdbIds(tmdbIds: number[]) {
        if (!tmdbIds.length) return [];
        return this.prisma.actor.findMany({ where: { tmdbId: { in: tmdbIds } } });
    }

    async findManyByImdbIds(imdbIds: string[]) {
        if (!imdbIds.length) return [];
        return this.prisma.actor.findMany({ where: { imdbId: { in: imdbIds } } });
    }

    async upsertTranslation(
        actorId: string,
        language: Language,
        data: Omit<Prisma.ActorTranslationCreateInput, 'actor' | 'language'>,
    ) {
        return this.prisma.actorTranslation.upsert({
            where: { actorId_language: { actorId, language } },
            update: {
                name: data.name,
                biography: data.biography,
            },
            create: {
                actor: { connect: { id: actorId } },
                language,
                name: data.name,
                biography: data.biography ?? null,
            },
        });
    }

    async createTranslationsBulk(entries: Prisma.ActorTranslationCreateManyInput[], chunkSize = MAX_BATCH) {
        const chunks = chunkArray(entries, chunkSize);
        for (const chunk of chunks) {
            await this.prisma.actorTranslation.createMany({ data: chunk, skipDuplicates: true });
        }
    }

    async upsertManyBase(actors: Prisma.ActorCreateManyInput[]) {
        return this.prisma.$transaction(async (tx) => {
            const existing = await tx.actor.findMany({
                where: {
                    imdbId: {
                        in: actors.map((a) => a.imdbId),
                    },
                },
            });

            const existingImdbIds = new Set(existing.map((a) => a.imdbId));
            const toCreate = actors.filter((a) => !existingImdbIds.has(a.imdbId));
            const toUpdate = actors.filter((a) => existingImdbIds.has(a.imdbId));

            if (toCreate.length > 0) {
                await tx.actor.createMany({
                    data: toCreate,
                    skipDuplicates: true,
                });
            }

            for (const actor of toUpdate) {
                const { id: _id, ...actorData } = actor;
                await tx.actor.update({
                    where: { imdbId: actor.imdbId },
                    data: actorData,
                });
            }
        });
    }

    /**
     * Connects an actor to a movie (Cast table).
     * If connection already exists, updates metadata instead.
     */
    async connectToMovie(movieId: string, actorId: string, data: { character?: string | null; order?: number | null }) {
        return this.prisma.cast.upsert({
            where: { movieId_actorId: { movieId, actorId } },
            update: {
                character: data.character ?? null,
                order: data.order ?? null,
            },
            create: {
                movie: { connect: { id: movieId } },
                actor: { connect: { id: actorId } },
                character: data.character ?? null,
                order: data.order ?? null,
            },
        });
    }

    /**
     * Bulk connects actors to movies via the Cast table
     */
    async bulkConnectCast(entries: Prisma.CastCreateManyInput[], chunkSize = MAX_BATCH) {
        const chunks = chunkArray(entries, chunkSize);
        for (const chunk of chunks) {
            await this.prisma.cast.createMany({ data: chunk, skipDuplicates: true });
        }
    }

    /**
     * Fetches an actor by ID with all translations
     */
    async findByIdWithTranslations(actorId: string) {
        return this.prisma.actor.findUnique({
            where: { id: actorId },
            include: {
                translations: true,
            },
        });
    }

    /**
     * Fetches an actor by ID with translations and filmography
     */
    async findByIdWithMovies(actorId: string, language: Language, limit: number = 20) {
        return this.prisma.actor.findUnique({
            where: { id: actorId },
            include: {
                translations: {
                    where: { language },
                },
                cast: {
                    include: {
                        movie: {
                            include: {
                                translations: {
                                    where: { language },
                                },
                            },
                        },
                    },
                    orderBy: {
                        movie: {
                            releaseDate: 'desc',
                        },
                    },
                    take: limit,
                },
            },
        });
    }
}
