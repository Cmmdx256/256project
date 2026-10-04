import React, { useRef } from "react";

type Props = {
    children: React.ReactNode;
    max?: number; // degrees
    scale?: number;
    className?: string;
    style?: React.CSSProperties;
};

/**
 * Lightweight 3D tilt on mouse move (no deps).
 * Respects prefers-reduced-motion.
 */
export const Tilt: React.FC<Props> = ({ children, max = 8, scale = 1.01, className, style }) => {
    const ref = useRef<HTMLDivElement>(null);
    const raf = useRef<number | null>(null);
    const target = useRef({ rx: 0, ry: 0 });

    const onMove = (e: React.MouseEvent) => {
        const el = ref.current;
        if (!el) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const rect = el.getBoundingClientRect();
        const cx = (e.clientX - rect.left) / rect.width - 0.5;
        const cy = (e.clientY - rect.top) / rect.height - 0.5;
        target.current.ry = cx * max;
        target.current.rx = -cy * max;
        if (raf.current != null) return;
        raf.current = requestAnimationFrame(() => {
            raf.current = null;
            if (ref.current) {
                ref.current.style.transform = `perspective(900px) rotateX(${target.current.rx}deg) rotateY(${target.current.ry}deg) scale3d(${scale},${scale},${scale})`;
            }
        });
    };
    const onLeave = () => {
        if (raf.current) cancelAnimationFrame(raf.current);
        raf.current = null;
        if (ref.current) ref.current.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)";
    };

    return (
        <div
            ref={ref}
            className={className}
            style={{ transformStyle: "preserve-3d", willChange: "transform", ...style }}
            onMouseMove={onMove}
            onMouseLeave={onLeave}
        >
            {children}
        </div>
    );
};
