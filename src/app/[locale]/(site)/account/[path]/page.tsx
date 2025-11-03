import { AccountView } from '@daveyplate/better-auth-ui';
import { accountViewPaths } from '@daveyplate/better-auth-ui/server';

export const dynamicParams = false;

export function generateStaticParams() {
    return Object.values(accountViewPaths).map((path) => ({ path }));
}

type AccountPageProps = {
    params: Promise<{ path: string }>;
};

export default async function AccountPage({ params }: AccountPageProps) {
    const { path } = await params;

    return (
        <main className='container flex grow flex-col items-center justify-center self-center p-8 md:p-6 scrollable'>
            <AccountView path={path} />
        </main>
    );
}
