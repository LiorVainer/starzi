import { Language, Prisma, PrismaClient } from '@prisma/client';
import { chunkArray } from '@/lib/ingestion/utils';

const MAX_BATCH = 400;

export class GenresDAL {
    constructor(private prisma: PrismaClient) {}

    async upsertBaseGenre(tmdbId: number) {
        return this.prisma.genre.upsert({
            where: { tmdbId },
            create: { tmdbId },
            update: {},
        });
    }

    async createManyBase(entries: Prisma.GenreCreateManyInput[], chunkSize = MAX_BATCH) {
        const chunks = chunkArray(entries, chunkSize);
        for (const chunk of chunks) {
            await this.prisma.genre.createMany({ data: chunk, skipDuplicates: true });
        }
    }

    async upsertTranslation(genreId: string, language: Language, name: string) {
        return this.prisma.genreTranslation.upsert({
            where: { genreId_language: { genreId, language } },
            create: {
                genre: { connect: { id: genreId } },
                language,
                name,
            },
            update: { name },
        });
    }

    async createManyTranslations(entries: Prisma.GenreTranslationCreateManyInput[], chunkSize = MAX_BATCH) {
        const chunks = chunkArray(entries, chunkSize);
        for (const chunk of chunks) {
            await this.prisma.genreTranslation.createMany({ data: chunk, skipDuplicates: true });
        }
    }

    async findByTmdbId(tmdbId: number) {
        return this.prisma.genre.findUnique({
            where: { tmdbId },
        });
    }

    async findManyByTmdbIds(tmdbIds: number[]) {
        if (!tmdbIds.length) return [];
        return this.prisma.genre.findMany({ where: { tmdbId: { in: tmdbIds } } });
    }

    /**
     * Fetches a genre by ID with all translations
     */
    async findByIdWithTranslations(genreId: string) {
        return this.prisma.genre.findUnique({
            where: { id: genreId },
            include: {
                translations: true,
            },
        });
    }

    /**
     * Fetches a genre by TMDB ID with all translations
     */
    async findByTmdbIdWithTranslations(tmdbId: number) {
        return this.prisma.genre.findUnique({
            where: { tmdbId },
            include: {
                translations: true,
            },
        });
    }
}
