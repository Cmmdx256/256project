import { useEffect, useRef } from "react";

/**
 * Applies subtle mouse + scroll parallax to a background element.
 * Target element should be the .p256-hero-bg div.
 */
export const useParallaxBg = (bgRef: React.RefObject<HTMLElement | null>) => {
    const raf = useRef<number | null>(null);

    useEffect(() => {
        const bg = bgRef.current;
        if (!bg) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

        let mx = 0, my = 0, sy = 0;

        const apply = () => {
            raf.current = null;
            bg.style.transform = `translate3d(${mx * 10}px, ${my * 8 + sy * 0.12}px, 0) scale(1.03)`;
        };
        const queue = () => {
            if (raf.current == null) raf.current = requestAnimationFrame(apply);
        };

        const onMouseMove = (e: MouseEvent) => {
            const rect = bg.parentElement?.getBoundingClientRect();
            if (!rect) return;
            mx = (e.clientX - rect.left) / rect.width - 0.5;
            my = (e.clientY - rect.top) / rect.height - 0.5;
            queue();
        };
        const onScroll = (e: Event) => {
            const target = e.target as HTMLElement;
            sy = target.scrollTop * 0.06;
            queue();
        };

        const hero = bg.parentElement;
        hero?.addEventListener("mousemove", onMouseMove);
        hero?.addEventListener("scroll", onScroll, { passive: true } as any);

        return () => {
            hero?.removeEventListener("mousemove", onMouseMove);
            hero?.removeEventListener("scroll", onScroll as any);
            if (raf.current) cancelAnimationFrame(raf.current);
        };
    }, [bgRef]);
};

export const ParallaxBg = ({ bgRef }: { bgRef: React.RefObject<HTMLDivElement | null> }) => {
    useParallaxBg(bgRef as React.RefObject<HTMLElement | null>);
    return null;
};
