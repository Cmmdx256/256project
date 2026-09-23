import { Button, Dropdown, Modal, Progress, Flex, Steps, message } from "antd";
import type { MenuProps } from "antd";
import {
    DownloadOutlined,
    FileTextOutlined,
    FolderOutlined,
    CodeOutlined,
    LoadingOutlined,
    CheckCircleOutlined,
    RocketOutlined,
} from "@ant-design/icons";
import { useState, useRef } from "react";
import {
    downloadCurrentFile,
    downloadEntireJarAsZip,
    downloadGradleProject,
    downloadFabricWorkspace,
    type ProjectGenStage,
    type FabricWorkspaceStage,
} from "../logic/DownloadSource";
import type { ZipProgressCallback } from "../logic/DownloadSource";
import { useObservable } from "../utils/UseObservable";
import { selectedFile } from "../logic/State";
import { minecraftJar } from "../logic/MinecraftApi";

// ─── ZIP Progress State ───────────────────────────────────────────────────────

interface ZipProgress {
    current: number;
    total: number;
    className: string;
}

// ─── Source Download Progress State ──────────────────────────────────────────

interface SourceProgress {
    stage: 'manifest' | 'mappings' | 'decompile' | 'zip';
    label: string;
    current?: number;
    total?: number;
    className?: string;
}

function stageToStep(stage: SourceProgress['stage']): number {
    return { manifest: 0, mappings: 1, decompile: 2, zip: 3 }[stage] ?? 0;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const DownloadButton = () => {
    const currentFile = useObservable(selectedFile);
    const jar = useObservable(minecraftJar);
    const [messageApi, messageCtx] = message.useMessage();

    // Simple ZIP progress
    const [zipProgress, setZipProgress] = useState<ZipProgress | null>(null);
    const zipAbortRef = useRef<AbortController | null>(null);

    // Source download progress
    const [srcProgress, setSrcProgress] = useState<SourceProgress | null>(null);
    const srcAbortRef = useRef<AbortController | null>(null);

    // Fabric workspace progress
    const [fabProgress, setFabProgress] = useState<FabricWorkspaceStage | null>(null);
    const fabAbortRef = useRef<AbortController | null>(null);

    // ── Handlers ─────────────────────────────────────────────────────────────

    const handleDownloadCurrentFile = async () => {
        if (!currentFile) {
            messageApi.warning("Please select a file first.");
            return;
        }
        try {
            await downloadCurrentFile();
            messageApi.success("File downloaded.");
        } catch (err) {
            messageApi.error("Download failed: " + (err instanceof Error ? err.message : String(err)));
        }
    };

    const handleDownloadZip = async () => {
        if (!jar) { messageApi.warning("No Minecraft version loaded yet."); return; }

        const controller = new AbortController();
        zipAbortRef.current = controller;
        setZipProgress({ current: 0, total: 0, className: "Preparing…" });

        const onProgress: ZipProgressCallback = (current, total, className) => {
            setZipProgress({ current, total, className });
        };

        try {
            await downloadEntireJarAsZip(onProgress, controller.signal);
            messageApi.success("ZIP download complete!");
        } catch (err) {
            if ((err as DOMException).name === "AbortError") {
                messageApi.info("ZIP download cancelled.");
            } else {
                messageApi.error("ZIP failed: " + (err instanceof Error ? err.message : String(err)));
            }
        } finally {
            setZipProgress(null);
            zipAbortRef.current = null;
        }
    };

    const handleDownloadSources = async () => {
        if (!jar) { messageApi.warning("No Minecraft version loaded yet."); return; }

        const controller = new AbortController();
        srcAbortRef.current = controller;
        setSrcProgress({ stage: 'manifest', label: 'Starting…' });

        try {
            await downloadGradleProject((prog: ProjectGenStage) => {
                if (prog.stage === 'decompile') {
                    setSrcProgress({
                        stage: 'decompile',
                        label: prog.label,
                        current: prog.current,
                        total: prog.total,
                        className: prog.className,
                    });
                } else {
                    setSrcProgress({ stage: prog.stage, label: prog.label });
                }
            }, controller.signal);
            messageApi.success("Source code downloaded!");
        } catch (err) {
            if ((err as DOMException).name === "AbortError") {
                messageApi.info("Download cancelled.");
            } else {
                messageApi.error("Failed: " + (err instanceof Error ? err.message : String(err)));
            }
        } finally {
            setSrcProgress(null);
            srcAbortRef.current = null;
        }
    };

    const handleDownloadFabricWorkspace = async () => {
        if (!jar) { messageApi.warning("No Minecraft version loaded yet."); return; }

        const controller = new AbortController();
        fabAbortRef.current = controller;
        setFabProgress({ stage: 'fabric-meta', label: 'Starting…' });

        try {
            await downloadFabricWorkspace((prog: FabricWorkspaceStage) => {
                setFabProgress(prog);
            }, controller.signal);
            messageApi.success("Fabric workspace downloaded!");
        } catch (err) {
            if ((err as DOMException).name === "AbortError") {
                messageApi.info("Download cancelled.");
            } else {
                messageApi.error("Failed: " + (err instanceof Error ? err.message : String(err)));
            }
        } finally {
            setFabProgress(null);
            fabAbortRef.current = null;
        }
    };

    // ── Menu ──────────────────────────────────────────────────────────────────

    const menuItems: MenuProps["items"] = [
        {
            key: "current",
            label: "Download current file (.java)",
            icon: <FileTextOutlined />,
            disabled: !currentFile,
            onClick: handleDownloadCurrentFile,
        },
        {
            key: "zip",
            label: "Download entire JAR as ZIP",
            icon: <FolderOutlined />,
            disabled: !jar,
            onClick: handleDownloadZip,
        },
        { type: "divider" },
        {
            key: "sources",
            label: (
                <span>
                    <strong>⬇ Download Source Code</strong>
                    <br />
                    <span style={{ fontSize: "11px", color: "#888" }}>
                        Decompiled .java sources + Mojang mappings
                    </span>
                </span>
            ),
            icon: <CodeOutlined />,
            disabled: !jar,
            onClick: handleDownloadSources,
        },
        {
            key: "fabric",
            label: (
                <span>
                    <strong>⚙ Generate Fabric Workspace</strong>
                    <br />
                    <span style={{ fontSize: "11px", color: "#888" }}>
                        Runnable mod dev environment · ./gradlew runClient
                    </span>
                </span>
            ),
            icon: <RocketOutlined />,
            disabled: !jar,
            onClick: handleDownloadFabricWorkspace,
        },
    ];

    // ── Computed progress values ──────────────────────────────────────────────

    const zipPercent = zipProgress && zipProgress.total > 0
        ? Math.round((zipProgress.current / zipProgress.total) * 100)
        : 0;

    const srcStep = srcProgress ? stageToStep(srcProgress.stage) : 0;
    const srcPercent = srcProgress?.stage === 'decompile' && srcProgress.total
        ? Math.round((srcProgress.current! / srcProgress.total) * 100)
        : srcProgress?.stage === 'zip' ? 100
        : srcProgress?.stage === 'mappings' ? 50
        : 0;

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <>
            {messageCtx}

            {/* ZIP Progress Modal */}
            <Modal
                title="Downloading JAR as ZIP…"
                open={zipProgress !== null}
                closable={false}
                keyboard={false}
                mask={{ closable: false }}
                footer={
                    <Button color="danger" variant="outlined" onClick={() => zipAbortRef.current?.abort()}>
                        Cancel
                    </Button>
                }
            >
                <Flex vertical gap={8}>
                    <div style={{
                        fontFamily: "monospace", fontSize: "small",
                        overflow: "hidden", textOverflow: "ellipsis",
                        whiteSpace: "nowrap", width: "100%",
                    }}>
                        {zipProgress?.className}
                    </div>
                    <Progress
                        percent={zipPercent}
                        format={() => zipProgress ? `${zipProgress.current} / ${zipProgress.total}` : ""}
                    />
                </Flex>
            </Modal>

            {/* Source Download Progress Modal */}
            <Modal
                title="⬇ Downloading Source Code…"
                open={srcProgress !== null}
                closable={false}
                keyboard={false}
                mask={{ closable: false }}
                width={480}
                footer={
                    <Button color="danger" variant="outlined" onClick={() => srcAbortRef.current?.abort()}>
                        Cancel
                    </Button>
                }
            >
                <Flex vertical gap={16} style={{ paddingTop: 8 }}>
                    <Steps
                        size="small"
                        current={srcStep}
                        items={[
                            {
                                title: "Manifest",
                                description: "Fetch version info",
                                icon: srcStep === 0
                                    ? <LoadingOutlined />
                                    : srcStep > 0 ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : undefined,
                            },
                            {
                                title: "Mappings",
                                description: "Download Mojang mappings",
                                icon: srcStep === 1
                                    ? <LoadingOutlined />
                                    : srcStep > 1 ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : undefined,
                            },
                            {
                                title: "Decompile",
                                description: srcProgress?.stage === 'decompile'
                                    ? `${srcProgress.current} / ${srcProgress.total} classes`
                                    : "Decompile all classes",
                                icon: srcStep === 2
                                    ? <LoadingOutlined />
                                    : srcStep > 2 ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : undefined,
                            },
                            {
                                title: "Package",
                                description: "Build ZIP",
                                icon: srcStep === 3
                                    ? <LoadingOutlined />
                                    : undefined,
                            },
                        ]}
                    />

                    {srcProgress?.stage === 'decompile' && (
                        <>
                            <Progress
                                percent={srcPercent}
                                format={() =>
                                    `${srcProgress.current} / ${srcProgress.total}`
                                }
                            />
                            <div style={{
                                fontFamily: "monospace", fontSize: "11px",
                                overflow: "hidden", textOverflow: "ellipsis",
                                whiteSpace: "nowrap", color: "#888"
                            }}>
                                {srcProgress.className}
                            </div>
                        </>
                    )}

                    {srcProgress?.stage !== 'decompile' && (
                        <div style={{ color: "#888", fontSize: "13px" }}>
                            {srcProgress?.label}
                        </div>
                    )}
                </Flex>
            </Modal>

            {/* Fabric Workspace Progress Modal */}
            <Modal
                title="⚙ Generating Fabric Workspace…"
                open={fabProgress !== null}
                closable={false}
                keyboard={false}
                mask={{ closable: false }}
                width={420}
                footer={
                    <Button color="danger" variant="outlined" onClick={() => fabAbortRef.current?.abort()}>
                        Cancel
                    </Button>
                }
            >
                <Flex vertical gap={16} style={{ paddingTop: 8 }}>
                    <Steps
                        size="small"
                        current={fabProgress?.stage === 'fabric-meta' ? 0 : fabProgress?.stage === 'files' ? 1 : 2}
                        items={[
                            {
                                title: "Fabric Meta",
                                description: "Check version support",
                                icon: fabProgress?.stage === 'fabric-meta' ? <LoadingOutlined /> : fabProgress ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : undefined,
                            },
                            {
                                title: "Generate Files",
                                description: "Build project files",
                                icon: fabProgress?.stage === 'files' ? <LoadingOutlined /> : fabProgress?.stage === 'zip' ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : undefined,
                            },
                            {
                                title: "Package ZIP",
                                description: "Build ZIP archive",
                                icon: fabProgress?.stage === 'zip' ? <LoadingOutlined /> : undefined,
                            },
                        ]}
                    />
                    <div style={{ color: "#888", fontSize: "13px" }}>
                        {fabProgress?.label}
                    </div>
                </Flex>
            </Modal>

            {/* Download Dropdown Button */}
            <Dropdown menu={{ items: menuItems }} placement="bottom" trigger={["click"]}>
                <Button icon={<DownloadOutlined />}>Download</Button>
            </Dropdown>
        </>
    );
};
