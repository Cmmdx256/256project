import { useEffect, useState } from "react";
import { useObservable } from "../utils/UseObservable";
import { minecraftJar } from "../logic/MinecraftApi";

/**
 * Full-screen loading overlay shown until a Minecraft JAR is ready.
 * Fades out smoothly once content is available.
 */
export const LoadingScreen = () => {
    const jar = useObservable(minecraftJar);
    const [hidden, setHidden] = useState(false);
    const [mounted, setMounted] = useState(true);

    useEffect(() => {
        if (jar) {
            // Delay so animation can play
            setTimeout(() => setHidden(true), 300);
            setTimeout(() => setMounted(false), 850);
        }
    }, [jar]);

    if (!mounted) return null;

    return (
        <div className={`p256-loading-screen${hidden ? " hidden" : ""}`}>
            <div className="p256-loading-logo-wrap">
                <div className="p256-loading-ring" />
                <div className="p256-loading-ring-2" />
                <img
                    src="/256project_favicon.svg"
                    alt="256project"
                    className="p256-loading-logo"
                />
            </div>
            <div className="p256-loading-text">256project</div>
        </div>
    );
};
