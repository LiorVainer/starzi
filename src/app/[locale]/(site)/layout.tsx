import { DesktopModal } from '@/components/shared/DesktopModal';
import { MobileDrawer } from '@/components/shared/MobileDrawer';
import { LayoutGroup } from 'motion/react';
import { Spotlight } from '@/components/ui/spotlight-new';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
    return (
        <LayoutGroup>
            <div className='absolute inset-0 pointer-events-none' />
            {/* === Page Content === */}
            <div className='relative min-h-screen overflow-hidden' style={{ paddingTop: '3.5rem' }}>
                <Spotlight
                    gradientFirst={`
    radial-gradient(
      68.54% 68.72% at 55.02% 31.46%,
      color-mix(in oklch, var(--primary) 40%, transparent 60%) 0%,
      color-mix(in oklch, var(--primary) 20%, transparent 80%) 40%,
      transparent 80%
    )
  `}
                    gradientSecond={`
    radial-gradient(
      50% 50% at 50% 50%,
      color-mix(in oklch, var(--primary) 25%, transparent 75%) 0%,
      color-mix(in oklch, var(--primary) 10%, transparent 90%) 70%,
      transparent 100%
    )
  `}
                    gradientThird={`
    radial-gradient(
      50% 50% at 50% 50%,
      color-mix(in oklch, var(--primary) 20%, transparent 80%) 0%,
      color-mix(in oklch, var(--primary) 5%, transparent 95%) 70%,
      transparent 100%
    )
  `}
                />

                {children}
            </div>
            {/* Render modals once at app level */}
            <DesktopModal />
            <MobileDrawer />
        </LayoutGroup>
    );
}
