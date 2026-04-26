'use client';
import { Suspense } from 'react';
import { LanguageToggle } from '@/components/navigation/language-toggle';
import { SignedIn, SignedOut } from '@daveyplate/better-auth-ui';
import { MobileNav, MobileNavHeader, Navbar, NavBody } from '@/components/ui/resizable-navbar';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { NavbarLogo } from './navbar-logo';
import { User } from 'lucide-react';
import { UserButton } from '@/components/auth/user-button';
import { SearchLauncher } from '@/components/movie-search/SearchLauncher';
import { MovieTabsControl } from '@/components/movie-search/MovieTabsControl';

export const AppNavbar = () => {
    const isMobile = useIsMobile();
    const pathname = usePathname();

    return (
        <Navbar position='fixed' className={pathname === '/' ? 'backdrop-blur-none' : ''}>
            {!isMobile ? (
                <NavBody className={'container flex items-center gap-8'}>
                    <NavbarLogo />
                    <NavbarContent />
                </NavBody>
            ) : (
                <MobileNav>
                    <MobileNavHeader className='flex items-center gap-4'>
                        <NavbarLogo />
                        <NavbarContent />
                    </MobileNavHeader>
                </MobileNav>
            )}
        </Navbar>
    );
};

export const NavbarContent = () => {
    const t = useTranslations('nav');
    const pathname = usePathname(); // ✅ get the current route

    return (
        <nav className='relative flex min-w-0 flex-1 items-center justify-end gap-3 md:gap-4 lg:justify-between lg:gap-8'>
            {pathname === '/now-playing' && (
                <div className='flex min-w-0 flex-1 justify-center'>
                    <div className='pointer-events-auto flex min-w-0 flex-1 items-center gap-3 md:gap-4 lg:max-w-3xl'>
                        <MovieTabsControl
                            className='hidden h-8 shrink-0 lg:block'
                            tabsClassName='h-full p-0'
                            triggerClassName='w-36 px-3 text-sm h-7.5'
                        />
                        <SearchLauncher className='flex-1' />
                    </div>
                </div>
            )}
            <div className='pointer-events-auto flex shrink-0 items-center gap-2 md:gap-6'>
                <div className='flex items-center gap-2'>
                    {/*<ModeToggle />*/}
                    <LanguageToggle />
                </div>
                <Suspense fallback={<div className='w-20 h-9 bg-muted rounded-full animate-pulse'></div>}>
                    <SignedIn>
                        <UserButton />
                    </SignedIn>

                    <SignedOut>
                        <Link href='/auth/sign-in'>
                            <Button size='sm' className='rounded-full font-semibold'>
                                <User className='sm:hidden size-4' />
                                <span className='hidden sm:inline'>{t('signIn')}</span>
                            </Button>
                        </Link>
                    </SignedOut>
                </Suspense>
            </div>
        </nav>
    );
};
