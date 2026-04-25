import MovieSearch from '@/components/movie-search/movie-search';

export default function HomePage() {
    return (
        <main className='container mx-auto h-[calc(100dvh-3.5rem)] w-full overflow-hidden px-4'>
            <MovieSearch />
        </main>
    );
}
