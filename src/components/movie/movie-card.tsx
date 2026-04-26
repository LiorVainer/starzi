'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { useOutsideClick } from '@/hooks/use-outside-click';
import type { MovieWithLanguageTranslation } from '@/models/movies.model';
import { useIsMobile } from '@/hooks/use-mobile';
import { useOverlayState } from '@/hooks/use-overlay-state';
import CollapsedMovieCard from './movie-card-collapsed';

export type MovieCardProps = {
    movie: MovieWithLanguageTranslation;
    ctaText?: string;
    ctaHref?: string;
    className?: string;
};

export default function MovieCard({ movie, className }: MovieCardProps) {
    const [active, setActive] = useState<boolean>(false);
    const [shouldPreload, setShouldPreload] = useState<boolean>(false);
    const ref = useRef<HTMLDivElement>(null);
    const id = useId();
    const isMobile = useIsMobile();
    const { openMovie } = useOverlayState();

    const imgSrc = movie.posterUrl || '/window.svg';

    const handleInteractionStart = () => {
        setShouldPreload(true);
    };

    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                setActive(false);
            }
        }

        if (!isMobile) {
            if (active) {
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = 'auto';
            }
        }

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [active, isMobile]);

    useOutsideClick(ref, () => setActive(false));

    const handleCardClick = () => {
        void openMovie(movie.id, movie);
    };

    return (
        <div onMouseEnter={handleInteractionStart} onTouchStart={handleInteractionStart} className={'w-full'}>
            {shouldPreload && <link rel='preload' as='image' href={imgSrc} />}

            <CollapsedMovieCard
                movie={movie}
                imgSrc={imgSrc}
                idSuffix={id}
                className={className}
                onClickAction={handleCardClick}
            />

            {/*<MovieVerticalCard*/}
            {/*    onClick={handleCardClick}*/}
            {/*    title={movie.title}*/}
            {/*    posterUrl={imgSrc}*/}
            {/*    imdbRating={movie.rating}*/}
            {/*/>*/}
        </div>
    );
}
