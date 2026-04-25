'use client';

import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import MovieCard from '@/components/movie/movie-card';
import { listGenres } from '@/app/actions/searchMovies';
import CollapsedMovieCardSkeleton from '@/components/movie/movie-card-collapsed.skeleton';
import { useTranslations } from 'next-intl';
import { FiltersProvider, useFilters } from '@/components/movie-search/FiltersContext';
import { SelectedGenreChips } from '@/components/movie-search/SelectedGenreChips';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import BadgeTabs, { type BadgeTabItem } from '@/components/ui/badge-tabs';
import { CalendarDays, Clapperboard } from 'lucide-react';
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
        <div className='scrollable h-full w-full overflow-y-auto overscroll-contain pb-28 pt-4 sm:pb-6 lg:pt-8'>
            {selectedGenres.length > 0 && (
                <div className='mb-4 w-full'>
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
                <div className='flex min-h-full flex-col'>
                    <motion.div
                        key={searchDebounced + sort + selectedGenresKey + page}
                        className='grid grid-cols-1 gap-5 md:grid-cols-2 lg:gap-8 xl:grid-cols-3'
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
                </div>
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
    const tabItems: BadgeTabItem[] = [
        { value: 'now-playing', label: t('nowPlaying'), icon: Clapperboard },
        { value: 'upcoming', label: t('upcoming'), icon: CalendarDays },
    ];

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
        <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as TabValue)}
            className='relative flex h-full min-h-0 w-full flex-col'
        >
            <div className='hidden shrink-0 justify-start pb-5 pt-6 sm:flex lg:pt-8'>
                <BadgeTabs items={tabItems} activeValue={tab} />
            </div>

            <div className='min-h-0 flex-1 overflow-hidden'>
                <TabsContent value='now-playing' className='m-0 h-full w-full'>
                    <MovieGridContent {...gridProps} />
                </TabsContent>

                <TabsContent value='upcoming' className='m-0 h-full w-full'>
                    <MovieGridContent {...gridProps} />
                </TabsContent>
            </div>

            <div className='fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:hidden'>
                <BadgeTabs items={tabItems} activeValue={tab} className='justify-center' triggerClassName='px-5' />
            </div>
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
