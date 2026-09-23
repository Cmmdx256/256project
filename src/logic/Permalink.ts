import { combineLatest } from "rxjs";
import { resetPermalinkAffectingSettings, supportsPermalinking } from "./Settings";
import { diffLeftSelectedMinecraftVersion, diffSelectionSide, diffView, vineflowerVersion, selectedFile, selectedLines, selectedMinecraftVersion } from "./State";
import { DEFAULT_VERSION, vineflowerVersionToPermalinkVersion } from "./vineflower/versions";
import { toClassFilePath, withoutClassExtension, type ClassFilePath } from "../utils/Names";

export interface State {
    version: number; // Allows us to change the permalink structure in the future
    minecraftVersion: string;
    file: ClassFilePath | undefined;
    selectedLines: {
        line: number;
        lineEnd?: number;
    } | null;
    diff?: {
        leftMinecraftVersion: string;
        selectionSide?: 'left' | 'right'; // if it's undefined, default to right
    };
}

const DEFAULT_STATE: State = {
    version: 2,
    minecraftVersion: "",
    file: undefined,
    selectedLines: null
};

export const parsePathToState = (path: string): State | null => {
    // Check for line number marker (e.g., #L123 or #L10-20, or #R123)
    // In normal mode L stands for line
    // In diff mode L stands for left, R stands for right
    // L & R cannot be mixed
    let lineNumber: number | null = null;
    let lineEnd: number | null = null;
    let diffSide: 'left' | 'right' | undefined = undefined;
    const lineMatch = path.match(/(?:#|%23)([LR])(\d+)(?:-(\d+))?$/);
    if (lineMatch) {
        if (!lineMatch[1] || !lineMatch[2]) {
            return null;
        }

        diffSide = lineMatch[1] === 'L' ? 'left' : 'right';
        lineNumber = parseInt(lineMatch[2], 10);
        if (lineMatch[3]) {
            lineEnd = parseInt(lineMatch[3], 10);
        }
        path = path.substring(0, lineMatch.index);
    }

    const segments = path.split('/').filter(s => s.length > 0);

    if (segments.length < 2) {
        return null;
    }

    const version = parseInt(segments[0], 10);

    if (segments[1] === 'diff') {
        if (segments.length < 4) {
            return null;
        }
        const leftMinecraftVersion = decodeURIComponent(segments[2]);
        const rightMinecraftVersion = decodeURIComponent(segments[3]);
        const filePath = segments.slice(4).join('/');
        const supportsLineNumbers = version === 2;
        return {
            version: DEFAULT_STATE.version, // Version 1 diff links have no line selection and can be safely upgraded.
            minecraftVersion: rightMinecraftVersion,
            file: filePath ? toClassFilePath(filePath) : undefined,
            selectedLines: supportsLineNumbers && lineNumber ? { line: lineNumber, lineEnd: lineEnd || undefined } : null,
            diff: {
                leftMinecraftVersion,
                ...(supportsLineNumbers && diffSide ? { selectionSide: diffSide } : {})
            }
        };
    }

    let minecraftVersion = decodeURIComponent(segments[1]);
    const filePath = segments.slice(2).join('/');

    // Backwards compatibility with the incorrect version name used previously
    if (minecraftVersion == "25w45a") {
        minecraftVersion = "25w45a_unobfuscated";
    }

    // #R not available in normal mode
    if (diffSide === 'right') {
        lineNumber = null;
        lineEnd = null;
    }

    return {
        version,
        minecraftVersion,
        file: filePath ? toClassFilePath(filePath) : undefined,
        selectedLines: lineNumber ? { line: lineNumber, lineEnd: lineEnd || undefined } : null
    };
};

export const getBaseUrl = (): string => {
    const base = import.meta.env.BASE_URL || '/';
    return base.endsWith('/') ? base : base + '/';
};

export const getFullBaseUrl = (): string => {
    if (typeof window === 'undefined') return '/';
    const origin = window.location.origin.replace(/\/+$/, '');
    const base = getBaseUrl();
    const cleanBase = base.startsWith('/') ? base : '/' + base;
    return `${origin}${cleanBase}`;
};

export const getFilePermalinkUrl = (
    filePath: string,
    minecraftVersion?: string
): string => {
    if (typeof window === 'undefined') return '';
    const fullBase = getFullBaseUrl();
    const vfVer = vineflowerVersionToPermalinkVersion(vineflowerVersion?.value ?? DEFAULT_VERSION);
    const linkPath = withoutClassExtension(filePath);
    const mcVer = minecraftVersion ?? selectedMinecraftVersion?.value;

    if (!mcVer) return '';

    if (diffView?.value && diffLeftSelectedMinecraftVersion?.value) {
        return `${fullBase}${vfVer}/diff/${encodeURIComponent(diffLeftSelectedMinecraftVersion.value)}/${encodeURIComponent(mcVer)}/${linkPath}`;
    }

    return `${fullBase}${vfVer}/${encodeURIComponent(mcVer)}/${linkPath}`;
};

export const getInitialState = (): State => {
    const rawPathname = window.location.pathname;
    const hash = window.location.hash;
    const base = getBaseUrl();

    let pathname = rawPathname;
    if (base !== '/' && pathname.startsWith(base)) {
        pathname = pathname.slice(base.length);
    } else if (pathname.startsWith('/')) {
        pathname = pathname.slice(1);
    }

    const newStyle = pathname !== '' && pathname !== '/';

    // Use pathname if it's not just "/" or empty (new style), otherwise use hash (old style)
    let path = newStyle
        ? pathname
        : (hash.startsWith('#/') ? hash.slice(2) : (hash.startsWith('#') ? hash.slice(1) : ''));

    // For new style (pathname-based), append hash if it contains line number
    if (newStyle && (hash.startsWith('#L') || hash.startsWith('#R'))) {
        path += hash;
    }

    try {
        const state = parsePathToState(path);
        if (state === null) {
            return DEFAULT_STATE;
        }

        resetPermalinkAffectingSettings();
        return state;
    } catch (e) {
        console.error("Error parsing permalink:", e);
        return DEFAULT_STATE;
    }
};

if (typeof window !== "undefined") {
    window.addEventListener('load', () => {
        combineLatest([
            selectedMinecraftVersion,
            diffLeftSelectedMinecraftVersion,
            selectedFile,
            selectedLines,
            supportsPermalinking,
            diffView,
            diffSelectionSide,
            vineflowerVersion
        ]).subscribe(([
            minecraftVersion,
            diffLeftMinecraftVersion,
            file,
            selectedLines,
            supported,
            diffView,
            diffSelectionSide,
            vineflowerVersion
        ]) => {
            const base = getBaseUrl();

            if (!file && !diffView) {
                document.title = "256project";
                window.location.hash = '';
                window.history.replaceState({}, '', base);
                return;
            }

            if (file) {
                const className = withoutClassExtension(file.split('/').pop() || file);
                document.title = className;
            } else {
                document.title = "256project";
            }

            if (!supported) {
                window.location.hash = '';
                window.history.replaceState({}, '', base);
                return;
            }

            let url = `${base}${vineflowerVersionToPermalinkVersion(vineflowerVersion)}/`;

            if (diffView) {
                url += `diff/${diffLeftMinecraftVersion}/${minecraftVersion}`;
                if (file) {
                    url += `/${withoutClassExtension(file)}`;
                }

                if (selectedLines) {
                    const side = diffSelectionSide === 'left' ? 'L' : 'R';

                    const { line, lineEnd } = selectedLines;
                    if (lineEnd && lineEnd !== line) {
                        url += `#${side}${Math.min(line, lineEnd)}-${Math.max(line, lineEnd)}`;
                    } else {
                        url += `#${side}${line}`;
                    }
                }
            } else {
                url += `${minecraftVersion}/${withoutClassExtension(file!)}`;

                if (selectedLines) {
                    const { line, lineEnd } = selectedLines;
                    if (lineEnd && lineEnd !== line) {
                        url += `#L${Math.min(line, lineEnd)}-${Math.max(line, lineEnd)}`;
                    } else {
                        url += `#L${line}`;
                    }
                }
            }

            window.history.replaceState({}, '', url);
        });
    });
}
