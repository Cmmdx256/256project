import { useEffect, useRef } from "react";

/**
 * Mouse + scroll parallax for .p256-hero-bg — lerp + rAF, no direct style thrash.
 * Target is the bg element; mousemove is listened on .p256-hero.
 */
export const useParallaxBg = (bgRef: React.RefObject<HTMLElement | null>) => {
    const raf = useRef<number | null>(null);

    useEffect(() => {
        const bg = bgRef.current;
        if (!bg) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

        let curX = 0, curY = 0, curSy = 0;
        let tgtX = 0, tgtY = 0, tgtSy = 0;

        const tick = () => {
            raf.current = null;
            curX += (tgtX - curX) * 0.10;
            curY += (tgtY - curY) * 0.10;
            curSy += (tgtSy - curSy) * 0.10;
            if (Math.abs(tgtX - curX) < 0.04) curX = tgtX;
            if (Math.abs(tgtY - curY) < 0.04) curY = tgtY;
            if (Math.abs(tgtSy - curSy) < 0.04) curSy = tgtSy;
            bg.style.transform = `translate3d(${curX}px, ${curY + curSy * 0.08}px, 0) scale(1.03)`;
            if (curX !== tgtX || curY !== tgtY || curSy !== tgtSy) {
                raf.current = requestAnimationFrame(tick);
            }
        };
        const schedule = () => { if (raf.current == null) raf.current = requestAnimationFrame(tick); };

        const onMouseMove = (e: MouseEvent) => {
            const hero = bg.parentElement;
            if (!hero) return;
            const rect = hero.getBoundingClientRect();
            const nx = (e.clientX - rect.left) / rect.width - 0.5;
            const ny = (e.clientY - rect.top) / rect.height - 0.5;
            tgtX = nx * 8;
            tgtY = ny * 6;
            schedule();
        };
        const onScroll = (e: Event) => {
            const target = e.target as HTMLElement;
            tgtSy = target.scrollTop;
            schedule();
        };
        const onLeave = () => { tgtX = 0; tgtY = 0; schedule(); };

        const hero = bg.parentElement;
        hero?.addEventListener("mousemove", onMouseMove);
        hero?.addEventListener("mouseleave", onLeave);
        hero?.addEventListener("scroll", onScroll, { passive: true } as any);

        return () => {
            hero?.removeEventListener("mousemove", onMouseMove);
            hero?.removeEventListener("mouseleave", onLeave);
            hero?.removeEventListener("scroll", onScroll as any);
            if (raf.current) cancelAnimationFrame(raf.current);
        };
    }, [bgRef]);
};

export const ParallaxBg = ({ bgRef }: { bgRef: React.RefObject<HTMLDivElement | null> }) => {
    useParallaxBg(bgRef as React.RefObject<HTMLElement | null>);
    return null;
};
