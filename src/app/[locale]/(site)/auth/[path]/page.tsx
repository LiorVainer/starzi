import { AuthView } from '@daveyplate/better-auth-ui';
import { authViewPaths } from '@daveyplate/better-auth-ui/server';

export const dynamicParams = false;

export function generateStaticParams() {
    return Object.values(authViewPaths).map((path) => ({ path }));
}

export default async function AuthPage({ params }: { params: Promise<{ path: string }> }) {
    const { path } = await params;

    return (
        <main className='container h-full flex grow flex-col items-center md:justify-center self-center p-4 md:p-6 flex-1'>
            <AuthView path={path} className='bg-background' />
        </main>
    );
}
