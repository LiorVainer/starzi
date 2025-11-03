'use client';

import { createContext, useContext } from 'react';
import type { PropsWithChildren } from 'react';
import { useLocale } from 'next-intl';
import { mapLocaleToLanguage } from '@/constants/languages.const';
import { useFiltersState, type FiltersState } from './useFilters';
import { useQuery } from '@tanstack/react-query';
import { searchNowPlayingMovies } from '@/app/actions/searchMovies';

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
            },
        ],
        queryFn: () =>
            searchNowPlayingMovies({
                ...filters.filters,
                search: filters.searchDebounced,
                actorName: filters.actorDebounced,
            }),
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
