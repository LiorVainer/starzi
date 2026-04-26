'use client';

import { useState, useCallback } from 'react';
import { FiltersProvider } from './FiltersContext';
import { SearchButton } from './SearchButton';
import { SearchModalOrDrawer } from './SearchModalOrDrawer';
import { cn } from '@/lib/utils';

type SearchLauncherProps = {
    className?: string;
};

export function SearchLauncher({ className }: SearchLauncherProps) {
    const [open, setOpen] = useState(false);

    const handleOpen = useCallback(() => {
        setOpen(true);
    }, []);

    const handleOpenChange = useCallback((next: boolean) => {
        setOpen(next);
    }, []);

    return (
        <FiltersProvider>
            <div className={cn('min-w-0', className)}>
                <SearchButton onClick={handleOpen} />
            </div>
            <SearchModalOrDrawer open={open} onOpenChange={handleOpenChange} />
        </FiltersProvider>
    );
}
