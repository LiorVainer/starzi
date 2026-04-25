'use client';

import { useIsMobile } from '@/hooks/use-mobile';
import { useTranslations } from 'next-intl';
import { SearchModalContent } from './SearchModalContent';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { XIcon } from 'lucide-react';
import { useFilters } from '@/components/movie-search/FiltersContext';
import { Spinner } from '@/components/ui/spinner';

interface SearchModalOrDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function SearchModalOrDrawer({ open, onOpenChange }: SearchModalOrDrawerProps) {
    const isMobile = useIsMobile();
    const tSearch = useTranslations('search');
    const tMovie = useTranslations('movie');
    const { isLoading } = useFilters();

    if (isMobile) {
        return (
            <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
                <DrawerContent className='max-h-[90vh] bg-background/80 backdrop-blur-md' transparentOverlay>
                    <DrawerHeader className='flex items-center justify-between border-b bg-background/80 px-4 py-3 hidden'>
                        <div className='flex items-center gap-2'>
                            <DrawerTitle className='text-base font-semibold bg-background/80 backdrop-blur-md'>
                                {tSearch('modalTitle')}
                            </DrawerTitle>
                        </div>
                        <DrawerClose asChild>
                            <Button variant='ghost' size='icon'>
                                <XIcon className='size-4' />
                                <span className='sr-only'>{tMovie('close')}</span>
                            </Button>
                        </DrawerClose>
                    </DrawerHeader>
                    <div className='flex-1 overflow-y-auto px-4 pb-6 pt-4 flex flex-col gap-4 w-full items-center'>
                        <SearchModalContent />
                    </div>
                </DrawerContent>
            </Drawer>
        );
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className='max-w-6xl w-full overflow-hidden'>
                <DialogHeader className='border-b pb-4'>
                    <DialogTitle className='text-xl font-semibold'>{tSearch('modalTitle')}</DialogTitle>
                </DialogHeader>
                <div className='max-h-[70vh] h-fit overflow-y-auto py-4'>
                    <SearchModalContent />
                </div>
            </DialogContent>
        </Dialog>
    );
}
