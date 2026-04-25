'use client';

import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import MovieCard from '@/components/movie/movie-card';
import { listGenres } from '@/app/actions/searchMovies';
import CollapsedMovieCardSkeleton from '@/components/movie/movie-card-collapsed.skeleton';
import { useTranslations } from 'next-intl';
import { FiltersProvider, useFilters } from '@/components/movie-search/FiltersContext';
import { SelectedGenreChips } from '@/components/movie-search/SelectedGenreChips';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { TabValue } from './useFilters';
import type { MovieWithLanguageTranslation } from '@/models/movies.model';

type MovieGridContentProps = {
    genres: { id: number; name: string }[];
    selectedGenres: number[];
    toggleGenre: (id: number) => void;
    isError: boolean;
    isFetching: boolean;
    items: MovieWithLanguageTranslation[];
    searchDebounced: string;
    sort: string;
    page: number;
    t: ReturnType<typeof useTranslations<'search'>>;
    tMovie: ReturnType<typeof useTranslations<'movie'>>;
};

function MovieGridContent({
    genres,
    selectedGenres,
    toggleGenre,
    isError,
    isFetching,
    items,
    searchDebounced,
    sort,
    page,
    t,
    tMovie,
}: MovieGridContentProps) {
    const selectedGenresKey = selectedGenres.join(',');

    return (
        <div className='h-full flex flex-col gap-4 lg:py-8 scrollable w-full'>
            {selectedGenres.length > 0 && (
                <div className='w-full'>
                    <SelectedGenreChips genres={genres} selected={selectedGenres} onRemove={toggleGenre} />
                </div>
            )}

            {isError && <div className='text-destructive'>{t('errorLoading')}</div>}

            {isFetching && items.length === 0 ? (
                <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-8'>
                    {Array.from({ length: 9 }).map((_, i) => (
                        <CollapsedMovieCardSkeleton key={i} />
                    ))}
                </div>
            ) : (
                <motion.div
                    key={searchDebounced + sort + selectedGenresKey + page}
                    className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 lg:gap-8'
                    variants={{
                        hidden: {},
                        show: {
                            transition: {
                                staggerChildren: 0.07,
                                delayChildren: 0.05,
                            },
                        },
                    }}
                    initial='hidden'
                    animate='show'
                >
                    {items.map((movie: MovieWithLanguageTranslation) => (
                        <motion.div
                            key={movie.id}
                            variants={{
                                hidden: { opacity: 0, y: 20, scale: 0.98 },
                                show: {
                                    opacity: 1,
                                    y: 0,
                                    scale: 1,
                                    transition: { type: 'spring', stiffness: 100, damping: 18 },
                                },
                            }}
                            className='w-full'
                        >
                            <MovieCard ctaText={tMovie('details')} movie={movie} />
                        </motion.div>
                    ))}

                    {items.length === 0 && !isFetching && (
                        <div className='text-sm text-muted-foreground'>{t('noResults')}</div>
                    )}
                </motion.div>
            )}
        </div>
    );
}

export function MovieSearchContent() {
    const t = useTranslations('search');
    const tMovie = useTranslations('movie');

    const {
        toggleGenre,
        selectedGenres,
        language,
        page,
        sort,
        searchDebounced,
        tab,
        setTab,
        data: moviesData,
        isLoading: isFetching,
        isError,
    } = useFilters();

    const items = moviesData?.items ?? [];

    const { data: genresData } = useQuery({
        queryKey: ['genres', language],
        queryFn: () => listGenres(language),
        staleTime: 1000 * 60 * 60,
    });

    const genres = genresData ?? [];

    const gridProps = {
        genres,
        selectedGenres,
        toggleGenre,
        isError,
        isFetching,
        items,
        searchDebounced,
        sort,
        page,
        t,
        tMovie,
    };

    return (
        <Tabs value={tab} onValueChange={(value) => setTab(value as TabValue)} className='w-full'>
            <TabsList className='mb-4'>
                <TabsTrigger value='now-playing'>{t('nowPlaying')}</TabsTrigger>
                <TabsTrigger value='upcoming'>{t('upcoming')}</TabsTrigger>
            </TabsList>

            <TabsContent value='now-playing' className='w-full'>
                <MovieGridContent {...gridProps} />
            </TabsContent>

            <TabsContent value='upcoming' className='w-full'>
                <MovieGridContent {...gridProps} />
            </TabsContent>
        </Tabs>
    );
}

export default function MovieSearch() {
    return (
        <FiltersProvider>
            <MovieSearchContent />
        </FiltersProvider>
    );
}
