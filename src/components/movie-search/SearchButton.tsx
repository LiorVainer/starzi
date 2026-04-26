'use client';

import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useFilters } from '@/components/movie-search/FiltersContext';
import { Spinner } from '../ui/spinner';

interface SearchButtonProps {
    onClick: () => void;
}

export function SearchButton({ onClick }: SearchButtonProps) {
    const t = useTranslations('nav');
    const { isLoading } = useFilters();

    return (
        <Button
            variant='outline'
            size={'sm'}
            className='flex h-8 w-full min-w-0 items-center gap-2 rounded-full font-semibold'
            onClick={onClick}
        >
            {isLoading ? <Spinner /> : <Search className='size-4' />}
            <span className='text-xs md:text-sm'>{t('search')}</span>
        </Button>
    );
}
