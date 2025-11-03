'use client';

import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import MovieCard from '@/components/movie/movie-card';
import { listGenres } from '@/app/actions/searchMovies';
import CollapsedMovieCardSkeleton from '@/components/movie/movie-card-collapsed.skeleton';
import { useTranslations } from 'next-intl';
import { FiltersProvider, useFilters } from '@/components/movie-search/FiltersContext';
import { SelectedGenreChips } from '@/components/movie-search/SelectedGenreChips';

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
        data: moviesData,
        isLoading: isFetching,
        isError,
    } = useFilters();

    const selectedGenresKey = selectedGenres.join(',');

    const items = moviesData?.items ?? [];

    const { data: genresData } = useQuery({
        queryKey: ['genres', language],
        queryFn: () => listGenres(language),
        staleTime: 1000 * 60 * 60,
    });

    const genres = genresData ?? [];

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
                    {items.map((movie) => (
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

export default function MovieSearch() {
    return (
        <FiltersProvider>
            <MovieSearchContent />
        </FiltersProvider>
    );
}
