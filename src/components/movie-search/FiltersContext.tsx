'use client';

import type { PropsWithChildren } from 'react';
import { createContext, useContext } from 'react';
import { useLocale } from 'next-intl';
import { mapLocaleToLanguage } from '@/constants/languages.const';
import { type FiltersState, useFiltersState } from './useFilters';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { searchNowPlayingMovies, searchUpcomingMovies } from '@/app/actions/searchMovies';

type QueryState = {
    isLoading: boolean;
    data: Awaited<ReturnType<typeof searchNowPlayingMovies>> | undefined;
    isError: boolean;
};

const FiltersContext = createContext<(FiltersState & QueryState) | null>(null);

export function FiltersProvider({ children }: PropsWithChildren) {
    const locale = useLocale();
    const language = mapLocaleToLanguage(locale);
    const filters = useFiltersState(language);
    const {
        data: moviesData,
        isPending,
        isError,
    } = useQuery({
        queryKey: [
            'movies-search',
            {
                search: filters.searchDebounced,
                actor: filters.actorDebounced,
                sort: filters.sort,
                selectedGenres: filters.selectedGenres,
                page: filters.page,
                pageSize: filters.pageSize,
                language: language,
                tab: filters.tab,
            },
        ],
        queryFn: () => {
            const searchFn = filters.tab === 'upcoming' ? searchUpcomingMovies : searchNowPlayingMovies;
            return searchFn({
                ...filters.filters,
                search: filters.searchDebounced,
                actorName: filters.actorDebounced,
            });
        },
        placeholderData: keepPreviousData,
    });

    return (
        <FiltersContext.Provider value={{ ...filters, data: moviesData, isLoading: isPending, isError }}>
            {children}
        </FiltersContext.Provider>
    );
}

export function useFilters() {
    const context = useContext(FiltersContext);

    if (!context) {
        throw new Error('useFilters must be used within a FiltersProvider');
    }

    return context;
}
