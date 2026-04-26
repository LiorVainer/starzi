import * as React from 'react';

import { cn } from '@/lib/utils';

function Empty({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot='empty'
            className={cn(
                'flex min-w-0 flex-col items-center justify-center gap-5 rounded-lg bg-transparent p-6 text-center',
                className,
            )}
            {...props}
        />
    );
}

function EmptyHeader({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot='empty-header' className={cn('flex flex-col items-center gap-3', className)} {...props} />;
}

function EmptyMedia({
    className,
    variant = 'default',
    ...props
}: React.ComponentProps<'div'> & {
    variant?: 'default' | 'icon';
}) {
    return (
        <div
            data-slot='empty-media'
            className={cn(
                'flex items-center justify-center text-primary',
                variant === 'icon' &&
                    'relative size-14 rounded-full bg-primary/10 shadow-[0_0_42px_color-mix(in_oklch,var(--primary)_28%,transparent)] ring-1 ring-primary/20 before:absolute before:inset-2 before:rounded-full before:bg-background/80 [&_svg]:relative [&_svg]:size-6',
                className,
            )}
            {...props}
        />
    );
}

function EmptyTitle({ className, ...props }: React.ComponentProps<'h3'>) {
    return (
        <h3
            data-slot='empty-title'
            className={cn('text-balance text-lg font-semibold text-foreground', className)}
            {...props}
        />
    );
}

function EmptyDescription({ className, ...props }: React.ComponentProps<'p'>) {
    return (
        <p
            data-slot='empty-description'
            className={cn(
                'max-w-sm text-pretty text-sm font-medium leading-6 text-muted-foreground sm:text-base',
                className,
            )}
            {...props}
        />
    );
}

function EmptyContent({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div data-slot='empty-content' className={cn('flex items-center justify-center gap-2', className)} {...props} />
    );
}

export { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle };
