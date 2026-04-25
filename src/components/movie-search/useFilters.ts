'use client';

import { useCallback, useMemo } from 'react';
import {
    parseAsArrayOf,
    parseAsInteger,
    parseAsString,
    parseAsStringEnum,
    useQueryStates,
    type UseQueryStatesKeysMap,
} from 'nuqs';
import { useDebounce } from '@/lib/useDebounce';
import { SORT_VALUES, SortValue } from '@/constants/sort.const';
import type { Language } from '@prisma/client';
import type { MovieFilters } from '@/app/actions/searchMovies';

const DEFAULT_SORT: SortValue = 'releaseDate:desc' as const;
const DEFAULT_PAGE_SIZE = 24;
const DEFAULT_PAGE = 1;

export type TabValue = 'now-playing' | 'upcoming';
export const TAB_VALUES = ['now-playing', 'upcoming'] as const;
const DEFAULT_TAB: TabValue = 'now-playing' as const;

type RawFilters = {
    readonly search: string;
    readonly actor: string;
    readonly sort: SortValue;
    readonly genres: number[];
    readonly page: number;
    readonly tab: TabValue;
};

const filterParsers = {
    search: parseAsString.withDefault(''),
    actor: parseAsString.withDefault(''),
    sort: parseAsStringEnum<SortValue>([...SORT_VALUES]).withDefault(DEFAULT_SORT),
    genres: parseAsArrayOf(parseAsInteger).withDefault([]),
    page: parseAsInteger.withDefault(DEFAULT_PAGE),
    tab: parseAsStringEnum<TabValue>([...TAB_VALUES]).withDefault(DEFAULT_TAB),
} satisfies UseQueryStatesKeysMap<RawFilters>;

const DEFAULT_SET_OPTIONS = {
    history: 'replace' as const,
    shallow: true,
};

export type FiltersState = {
    readonly search: string;
    readonly searchDebounced: string;
    readonly actorName: string;
    readonly actorDebounced: string;
    readonly sort: SortValue;
    readonly selectedGenres: number[];
    readonly page: number;
    readonly pageSize: number;
    readonly language: Language;
    readonly tab: TabValue;
    readonly filters: MovieFilters;
    setSearch: (next: string) => Promise<URLSearchParams>;
    setActorName: (next: string) => Promise<URLSearchParams>;
    setSort: (next: SortValue) => Promise<URLSearchParams>;
    toggleGenre: (id: number) => Promise<URLSearchParams>;
    clearGenres: () => Promise<URLSearchParams>;
    clearAll: () => Promise<URLSearchParams>;
    setPage: (page: number) => Promise<URLSearchParams>;
    setTab: (tab: TabValue) => Promise<URLSearchParams>;
};

export function useFiltersState(language: Language): FiltersState {
    const [rawFilters, setRawFilters] = useQueryStates(filterParsers, {
        history: 'replace',
        shallow: true,
        clearOnDefault: true,
    });

    const searchDebounced = useDebounce(rawFilters.search, 400);
    const actorDebounced = useDebounce(rawFilters.actor, 400);

    const setSearch = useCallback(
        (next: string) =>
            setRawFilters(
                (prev: RawFilters) => ({
                    ...prev,
                    search: next,
                    page: DEFAULT_PAGE,
                }),
                {
                    ...DEFAULT_SET_OPTIONS,
                },
            ),
        [setRawFilters],
    );

    const setActorName = useCallback(
        (next: string) =>
            setRawFilters(
                (prev: RawFilters) => ({
                    ...prev,
                    actor: next,
                    page: DEFAULT_PAGE,
                }),
                {
                    ...DEFAULT_SET_OPTIONS,
                },
            ),
        [setRawFilters],
    );

    const setSort = useCallback(
        (next: SortValue) =>
            setRawFilters(
                (prev: RawFilters) => ({
                    ...prev,
                    sort: next,
                    page: DEFAULT_PAGE,
                }),
                DEFAULT_SET_OPTIONS,
            ),
        [setRawFilters],
    );

    const toggleGenre = useCallback(
        (id: number) =>
            setRawFilters((prev: RawFilters) => {
                const exists = prev.genres.includes(id);
                const nextGenres = exists ? prev.genres.filter((genreId) => genreId !== id) : [...prev.genres, id];
                return {
                    ...prev,
                    genres: nextGenres,
                    page: DEFAULT_PAGE,
                };
            }, DEFAULT_SET_OPTIONS),
        [setRawFilters],
    );

    const clearGenres = useCallback(
        () =>
            setRawFilters(
                (prev: RawFilters) => ({
                    ...prev,
                    genres: [],
                    page: DEFAULT_PAGE,
                }),
                DEFAULT_SET_OPTIONS,
            ),
        [setRawFilters],
    );

    const clearAll = useCallback(
        () =>
            setRawFilters(
                {
                    search: '',
                    actor: '',
                    sort: DEFAULT_SORT,
                    genres: [],
                    page: DEFAULT_PAGE,
                },
                DEFAULT_SET_OPTIONS,
            ),
        [setRawFilters],
    );

    const setPage = useCallback(
        (page: number) =>
            setRawFilters(
                (prev: RawFilters) => ({
                    ...prev,
                    page: Math.max(DEFAULT_PAGE, page),
                }),
                DEFAULT_SET_OPTIONS,
            ),
        [setRawFilters],
    );

    const setTab = useCallback(
        (tab: TabValue) =>
            setRawFilters(
                (prev: RawFilters) => ({
                    ...prev,
                    tab,
                    page: DEFAULT_PAGE,
                }),
                DEFAULT_SET_OPTIONS,
            ),
        [setRawFilters],
    );

    const { search, actor, sort, genres, page } = rawFilters;

    const filters = useMemo<MovieFilters>(
        () => ({
            search,
            searchDebounced,
            actorName: actor,
            actorNameDebounced: actorDebounced,
            sort,
            selectedGenres: genres,
            page,
            pageSize: DEFAULT_PAGE_SIZE,
            language,
        }),
        [actor, actorDebounced, genres, language, page, search, searchDebounced, sort],
    );

    return {
        search: rawFilters.search,
        searchDebounced,
        actorName: rawFilters.actor,
        actorDebounced,
        sort: rawFilters.sort,
        selectedGenres: rawFilters.genres,
        page: rawFilters.page,
        pageSize: DEFAULT_PAGE_SIZE,
        language,
        tab: rawFilters.tab,
        filters,
        setSearch,
        setActorName,
        setSort,
        toggleGenre,
        clearGenres,
        clearAll,
        setPage,
        setTab,
    };
}
