'use client';

import { parseAsInteger, parseAsStringEnum, useQueryStates } from 'nuqs';
import { useTranslations } from 'next-intl';
import { CalendarDays, Clapperboard } from 'lucide-react';
import { Tabs } from '@/components/ui/tabs';
import BadgeTabs, { type BadgeTabItem } from '@/components/ui/badge-tabs';
import { cn } from '@/lib/utils';
import { TAB_VALUES, type TabValue } from './useFilters';

type MovieTabsControlProps = {
    className?: string;
    tabsClassName?: string;
    triggerClassName?: string;
};

const tabParser = {
    tab: parseAsStringEnum<TabValue>([...TAB_VALUES]).withDefault('now-playing'),
    page: parseAsInteger.withDefault(1),
};

export function MovieTabsControl({ className, tabsClassName, triggerClassName }: MovieTabsControlProps) {
    const t = useTranslations('search');
    const [{ tab }, setTabState] = useQueryStates(tabParser, {
        history: 'replace',
        shallow: true,
        clearOnDefault: true,
    });

    const tabItems: BadgeTabItem[] = [
        { value: 'now-playing', label: t('nowPlaying'), icon: Clapperboard },
        { value: 'upcoming', label: t('upcoming'), icon: CalendarDays },
    ];

    return (
        <Tabs
            value={tab}
            onValueChange={(value) =>
                setTabState({
                    tab: value as TabValue,
                    page: 1,
                })
            }
            className={cn('w-fit', className)}
        >
            <BadgeTabs
                items={tabItems}
                activeValue={tab}
                className={tabsClassName}
                triggerClassName={triggerClassName}
            />
        </Tabs>
    );
}
