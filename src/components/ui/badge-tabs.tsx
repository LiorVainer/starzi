'use client';

import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface BadgeTabItem {
    value: string;
    label: string;
    icon?: LucideIcon;
    badge?: number;
}

interface BadgeTabsProps {
    items: BadgeTabItem[];
    activeValue: string;
    className?: string;
    triggerClassName?: string;
}

export default function BadgeTabs({ items, activeValue, className, triggerClassName }: BadgeTabsProps) {
    return (
        <TabsList
            className={cn(
                'grid h-auto w-fit max-w-[calc(100vw-2rem)] grid-cols-2 gap-1 rounded-full border border-border/70 bg-background/85 p-1.5 shadow-glass backdrop-blur-xl',
                className,
            )}
        >
            {items.map((item) => {
                const isActive = item.value === activeValue;
                const Icon = item.icon;

                return (
                    <TabsTrigger
                        key={item.value}
                        value={item.value}
                        className={cn(
                            'h-10 w-40 rounded-full border-0 bg-transparent px-4 text-sm font-semibold whitespace-nowrap shadow-none outline-none transition-colors duration-200',
                            'focus:border-0 focus:outline-none focus:ring-0 focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0',
                            'data-[state=active]:bg-primary data-[state=active]:text-black data-[state=active]:shadow-none',
                            isActive ? 'text-black' : 'text-muted-foreground hover:text-foreground',
                            triggerClassName,
                        )}
                    >
                        {Icon && <Icon className='size-4 shrink-0' aria-hidden='true' />}
                        <span>{item.label}</span>
                        {!!item.badge && item.badge > 0 && (
                            <span
                                className={cn(
                                    'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold',
                                    isActive ? 'bg-black/10 text-black' : 'bg-muted text-foreground',
                                )}
                            >
                                {item.badge}
                            </span>
                        )}
                    </TabsTrigger>
                );
            })}
        </TabsList>
    );
}
