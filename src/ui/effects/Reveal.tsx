import React, { useEffect, useRef, useState } from "react";

type Props = {
    children: React.ReactNode;
    delayMs?: number;
    className?: string;
    style?: React.CSSProperties;
};

/**
 * IntersectionObserver reveal with subtle 3D tilt-in.
 * Falls back to immediately visible if IO unsupported or reduced motion.
 */
export const Reveal: React.FC<Props> = ({ children, delayMs = 0, className, style }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            setVisible(true);
            return;
        }
        const el = ref.current;
        if (!el || typeof IntersectionObserver === "undefined") {
            setVisible(true);
            return;
        }
        const io = new IntersectionObserver(
            (entries) => {
                for (const e of entries) if (e.isIntersecting) { setVisible(true); io.disconnect(); break; }
            },
            { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
        );
        io.observe(el);
        return () => io.disconnect();
    }, []);

    return (
        <div
            ref={ref}
            className={className}
            style={{
                opacity: visible ? 1 : 0,
                transform: visible ? "perspective(900px) rotateX(0deg) translateY(0) scale(1)" : "perspective(900px) rotateX(8deg) translateY(14px) scale(0.98)",
                transition: `opacity 0.52s cubic-bezier(0.22,1,0.36,1) ${delayMs}ms, transform 0.62s cubic-bezier(0.22,1,0.36,1) ${delayMs}ms`,
                willChange: "transform, opacity",
                transformStyle: "preserve-3d",
                ...style,
            }}
        >
            {children}
        </div>
    );
};
