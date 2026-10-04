import { useEffect, useRef } from "react";

type Orb = { left: string; top: string; size: number; color: string; dur: string; delay: string };
type Cube = { left: string; top: string; size: number; dur: string; delay: string; alt?: boolean };

const orbs: Orb[] = [
    { left: "8%",  top: "10%", size: 220, color: "rgba(124,58,237,0.22)", dur: "13s", delay: "0s" },
    { left: "72%", top: "6%",  size: 180, color: "rgba(6,182,214,0.18)",  dur: "11s", delay: "-2s" },
    { left: "42%", top: "38%", size: 260, color: "rgba(236,72,153,0.12)", dur: "16s", delay: "-5s" },
    { left: "78%", top: "52%", size: 160, color: "rgba(124,58,237,0.16)", dur: "12s", delay: "-7s" },
    { left: "18%", top: "64%", size: 140, color: "rgba(6,182,214,0.14)",  dur: "10s", delay: "-3s" },
];

const cubes: Cube[] = [
    { left: "6%",  top: "18%", size: 28, dur: "7.2s", delay: "0s", alt: false },
    { left: "84%", top: "14%", size: 20, dur: "6.5s", delay: "-1.2s", alt: true },
    { left: "14%", top: "72%", size: 18, dur: "8s",   delay: "-2.4s", alt: false },
    { left: "76%", top: "68%", size: 24, dur: "7.8s", delay: "-0.8s", alt: true },
    { left: "48%", top: "8%",  size: 14, dur: "6s",   delay: "-3s", alt: false },
    { left: "58%", top: "78%", size: 16, dur: "9s",   delay: "-4s", alt: true },
];

/**
 * Decorative 3D floating layer: blurred gradient orbs + small glass cubes
 * that drift with CSS 3D transforms. Mouse parallax is applied via inline
 * transform so it stays cheap (only compositor).
 */
export const FloatingScene = () => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (prefersReduced) return;

        const onMove = (e: MouseEvent) => {
            const rect = el.getBoundingClientRect();
            const cx = (e.clientX - rect.left) / rect.width - 0.5;
            const cy = (e.clientY - rect.top) / rect.height - 0.5;
            // tiny parallax — keep it subtle
            el.style.setProperty("--mx", String(cx));
            el.style.setProperty("--my", String(cy));
            const cubesEls = el.querySelectorAll<HTMLElement>("[data-parallax]");
            cubesEls.forEach((n) => {
                const depth = Number(n.dataset.depth || "1");
                const tx = cx * depth * 18;
                const ty = cy * depth * 14;
                n.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
            });
        };
        const onLeave = () => {
            const cubesEls = el.querySelectorAll<HTMLElement>("[data-parallax]");
            cubesEls.forEach((n) => { n.style.transform = "translate3d(0,0,0)"; });
        };
        el.addEventListener("mousemove", onMove);
        el.addEventListener("mouseleave", onLeave);
        return () => {
            el.removeEventListener("mousemove", onMove);
            el.removeEventListener("mouseleave", onLeave);
        };
    }, []);

    return (
        <div ref={ref} className="p256-floating-layer" aria-hidden>
            {orbs.map((o, i) => (
                <div
                    key={`orb-${i}`}
                    className="p256-glow-orb"
                    style={
                        {
                            left: o.left,
                            top: o.top,
                            width: o.size,
                            height: o.size,
                            background: `radial-gradient(circle at 35% 30%, ${o.color}, transparent 70%)`,
                            animationDelay: o.delay,
                            ["--dur" as unknown as string]: o.dur,
                        } as React.CSSProperties
                    }
                />
            ))}
            {cubes.map((c, i) => (
                <div
                    key={`cube-${i}`}
                    data-parallax
                    data-depth={String(0.6 + (i % 3) * 0.45)}
                    className={`p256-cube${c.alt ? " p256-cube-alt" : ""}`}
                    style={
                        {
                            left: c.left,
                            top: c.top,
                            width: c.size,
                            height: c.size,
                            animationDelay: c.delay,
                            opacity: 0.92,
                            transition: "transform 0.45s cubic-bezier(0.16,1,0.3,1)",
                            ["--dur" as unknown as string]: c.dur,
                        } as React.CSSProperties
                    }
                />
            ))}
        </div>
    );
};
