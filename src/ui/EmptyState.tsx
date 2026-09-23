import React, { useEffect, useRef } from "react";
import {
    GithubOutlined, SearchOutlined, LinkOutlined,
    BranchesOutlined, CopyOutlined, CodeOutlined, AimOutlined
} from '@ant-design/icons';
import { Typography, theme } from 'antd';
import { classesList } from "../logic/JarFile";
import { openCodeTab } from "../logic/tabs";
import { useObservable } from "../utils/UseObservable";

const { Paragraph } = Typography;
const { useToken } = theme;

const features = [
    { icon: <LinkOutlined style={{ fontSize: "15px" }} />, color: "#a78bfa", title: "Version Comparison", description: "Select \"Compare\" to diff two versions side by side" },
    { icon: <BranchesOutlined style={{ fontSize: "15px" }} />, color: "#f472b6", title: "Inheritance Graph", description: "Right-click → 'Show Inheritance Hierarchy'" },
    { icon: <SearchOutlined style={{ fontSize: "15px" }} />, color: "#34d399", title: "Find References", description: "Right-click on any declaration → 'Find References'" },
    { icon: <AimOutlined style={{ fontSize: "15px" }} />, color: "#60a5fa", title: "Go to Declaration", description: "Ctrl/Cmd + Click on any class, method, or field" },
    { icon: <CopyOutlined style={{ fontSize: "15px" }} />, color: "#fbbf24", title: "Mixin Strings", description: "Right-click → 'Copy Mixin Target' for mixin configs" },
    { icon: <CodeOutlined style={{ fontSize: "15px" }} />, color: "#f87171", title: "Bytecode View", description: "Enable \"Show Bytecode\" in settings" },
];

export const EmptyState = () => {
    const { token } = useToken();
    const outerClasses = useObservable(classesList);

    const openRandomClass = () => {
        if (outerClasses && outerClasses.length > 0) {
            const filtered = outerClasses.filter(c => !c.endsWith('package-info.class'));
            if (filtered.length > 0) openCodeTab(filtered[Math.floor(Math.random() * filtered.length)]);
        }
    };

    return (
        <div className="p256-hero">
            {/* ── Background image with gradient overlay ── */}
            <div className="p256-hero-bg" style={{ backgroundImage: `url("${import.meta.env.BASE_URL}mc-bg.jpg")` }} />

            {/* ── Content (slides up from bottom) ── */}
            <div className="p256-hero-content">

                {/* Logo + Title */}
                <div className="p256-enter-1" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                    <img
                        src={`${import.meta.env.BASE_URL}256project_favicon.svg`}
                        alt="256project"
                        className="p256-logo-glow"
                        style={{ width: 72, height: 72 }}
                    />
                    <h1 className="p256-gradient-title">
                        Minecraft Source Explorer
                    </h1>
                </div>

                {/* Subtitle */}
                <Paragraph className="p256-enter-2" style={{
                    fontSize: 14, marginBottom: 0,
                    color: "rgba(255,255,255,0.65)",
                    textAlign: "center", fontWeight: 500, maxWidth: 460,
                }}>
                    Browser-based decompiled Minecraft Java Edition source viewer.
                    No server. No installs. Everything runs in your browser.
                </Paragraph>

                {/* CTA */}
                <p className="p256-enter-3" style={{
                    fontSize: 13, margin: 0,
                    color: "rgba(255,255,255,0.4)",
                    textAlign: "center",
                }}>
                    Pick a file from the left panel, or{" "}
                    <span className="p256-random-link" onClick={openRandomClass}>
                        open a random class
                    </span>
                </p>

                {/* How It Works */}
                <div className="p256-howit-card p256-enter-4">
                    <div className="p256-section-label">How It Works</div>
                    <ul style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: 1.9, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
                        <li>Minecraft JAR downloaded directly from Mojang's servers to your device</li>
                        <li>Decompilation happens entirely in your browser via WebAssembly</li>
                        <li>No Minecraft code is redistributed by this website</li>
                        <li>Powered by{" "}
                            <a href="https://github.com/Vineflower/vineflower" target="_blank" rel="noreferrer" style={{ color: 'var(--p256-accent)' }}>Vineflower</a>
                            {" "}via{" "}
                            <a href="https://www.npmjs.com/package/@run-slicer/vf" target="_blank" rel="noreferrer" style={{ color: 'var(--p256-accent)' }}>@run-slicer/vf</a>
                        </li>
                    </ul>
                </div>

                {/* Features */}
                <div className="p256-enter-5" style={{ width: '100%' }}>
                    <div className="p256-section-label">Features</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                        {features.map((f, i) => (
                            <div
                                key={i}
                                className="p256-feature-card"
                                title={f.description}
                                style={{ animationDelay: `${0.5 + i * 0.06}s` }}
                            >
                                <div className="p256-feature-icon" style={{ background: `${f.color}18` }}>
                                    <span style={{ color: f.color }}>{f.icon}</span>
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.9)", lineHeight: 1.3 }}>{f.title}</div>
                                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2, lineHeight: 1.4 }}>{f.description}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* GitHub */}
                <a
                    href="https://github.com/256project/256project"
                    target="_blank" rel="noreferrer"
                    className="p256-github-btn p256-enter-6"
                >
                    <GithubOutlined style={{ fontSize: 18 }} />
                    Star on GitHub
                </a>
            </div>
        </div>
    );
};
