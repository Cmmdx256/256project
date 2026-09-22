/**
 * 256project — ProjectGenerator.ts
 *
 * Downloads Minecraft source code + official Mojang mappings.
 * The output ZIP contains:
 *
 *   src/**\/*.java          – decompiled .java source files (with mappings applied)
 *   mappings/official.txt  – ProGuard ↔ readable name mapping
 */

import { firstValueFrom } from 'rxjs';
import { minecraftJar } from './MinecraftApi';
import { displayLambdas } from './Settings';
import { getDecompilerOptions } from './Decompiler';
import { decompileClass, setOptions } from '../workers/decompile/client';
import { DEFAULT_VERSION } from './vineflower/versions';
import { classNameFromClassFilePath, type ClassFilePath } from '../utils/Names';

// ─── Progress ────────────────────────────────────────────────────────────────

export type ProjectGenStage =
    | { stage: 'manifest'; label: string }
    | { stage: 'mappings'; label: string }
    | { stage: 'decompile'; label: string; current: number; total: number; className: string }
    | { stage: 'zip'; label: string };

export type ProjectGenProgressCallback = (progress: ProjectGenStage) => void;

// ─── CRC32 ───────────────────────────────────────────────────────────────────

function makeCrcTable(): Uint32Array {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c;
    }
    return t;
}
const CRC_TABLE = makeCrcTable();

function crc32(data: Uint8Array): number {
    let c = 0xffffffff;
    for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

// ─── ZIP Builder ─────────────────────────────────────────────────────────────

interface ZipEntry {
    name: Uint8Array;
    data: Uint8Array;
    crc: number;
    offset: number;
}

function w16(v: DataView, o: number, x: number) { v.setUint16(o, x, true); }
function w32(v: DataView, o: number, x: number) { v.setUint32(o, x, true); }

function buildZip(entries: ZipEntry[]): Blob {
    const parts: Uint8Array[] = [];
    let offset = 0;

    for (const entry of entries) {
        const hdr = new ArrayBuffer(30 + entry.name.length);
        const dv = new DataView(hdr);
        w32(dv, 0, 0x04034b50); w16(dv, 4, 20); w16(dv, 6, 0); w16(dv, 8, 0);
        w16(dv, 10, 0); w16(dv, 12, 0);
        w32(dv, 14, entry.crc);
        w32(dv, 18, entry.data.length); w32(dv, 22, entry.data.length);
        w16(dv, 26, entry.name.length); w16(dv, 28, 0);
        new Uint8Array(hdr, 30).set(entry.name);
        parts.push(new Uint8Array(hdr));
        parts.push(entry.data);
        offset += hdr.byteLength + entry.data.length;
    }

    const cdOffset = offset;
    for (const entry of entries) {
        const cd = new ArrayBuffer(46 + entry.name.length);
        const dv = new DataView(cd);
        w32(dv, 0, 0x02014b50); w16(dv, 4, 20); w16(dv, 6, 20); w16(dv, 8, 0); w16(dv, 10, 0);
        w16(dv, 12, 0); w16(dv, 14, 0);
        w32(dv, 16, entry.crc); w32(dv, 20, entry.data.length); w32(dv, 24, entry.data.length);
        w16(dv, 28, entry.name.length); w16(dv, 30, 0); w16(dv, 32, 0); w16(dv, 34, 0); w16(dv, 36, 0);
        w32(dv, 38, 0);
        w32(dv, 42, entry.offset);
        new Uint8Array(cd, 46).set(entry.name);
        parts.push(new Uint8Array(cd));
        offset += cd.byteLength;
    }

    const cdSize = offset - cdOffset;
    const eocd = new ArrayBuffer(22);
    const dv = new DataView(eocd);
    w32(dv, 0, 0x06054b50); w16(dv, 4, 0); w16(dv, 6, 0);
    w16(dv, 8, entries.length); w16(dv, 10, entries.length);
    w32(dv, 12, cdSize); w32(dv, 16, cdOffset); w16(dv, 20, 0);
    parts.push(new Uint8Array(eocd));

    return new Blob(parts as BlobPart[], { type: 'application/zip' });
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

const enc = new TextEncoder();

function textEntry(path: string, content: string, offset: number): ZipEntry {
    const name = enc.encode(path);
    const data = enc.encode(content);
    return { name, data, crc: crc32(data), offset };
}

export async function generateGradleProject(
    onProgress: ProjectGenProgressCallback,
    signal?: AbortSignal
): Promise<Blob> {
    // ── Stage 1: Load current JAR & fetch version manifest ────────────────────
    onProgress({ stage: 'manifest', label: 'Fetching version manifest…' });

    const jar = await firstValueFrom(minecraftJar);
    const version = jar.version;

    // Fetch Mojang version list directly to get the per-version manifest URL
    interface MojangVersionEntry { id: string; url: string; }
    interface MojangVersionList { versions: MojangVersionEntry[]; }
    interface VersionDownload { url: string; sha1?: string; }
    interface VersionManifestFull {
        downloads: {
            client: VersionDownload;
            client_mappings?: VersionDownload;
        };
    }

    let fullManifest: VersionManifestFull | null = null;
    try {
        const listResp = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
        if (listResp.ok) {
            const list = await listResp.json() as MojangVersionList;
            const entry = list.versions.find(v => v.id === version);
            if (entry) {
                const mResp = await fetch(entry.url);
                if (mResp.ok) {
                    fullManifest = await mResp.json() as VersionManifestFull;
                    console.log('[256project] Full manifest fetched for', version);
                }
            } else {
                console.warn('[256project] Version not found in Mojang list:', version);
            }
        }
    } catch (e) {
        console.warn('[256project] Could not fetch version manifest:', e);
    }

    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');

    // ── Stage 2: Fetch official Mojang mappings ───────────────────────────────
    onProgress({ stage: 'mappings', label: 'Downloading official Mojang mappings…' });

    let mappingsText: string | null = null;
    const mappingsUrl = fullManifest?.downloads?.client_mappings?.url;

    console.log('[256project] Mappings URL:', mappingsUrl ?? '(not available)');

    if (mappingsUrl) {
        try {
            const resp = await fetch(mappingsUrl);
            if (resp.ok) {
                mappingsText = await resp.text();
                console.log('[256project] Mappings fetched, length:', mappingsText.length);
            } else {
                console.warn('[256project] Mappings fetch failed, status:', resp.status);
            }
        } catch (e) {
            console.warn('[256project] Could not fetch mappings:', e);
        }
    } else {
        console.warn('[256project] No client_mappings URL in manifest (older version?)');
    }

    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');

    // ── Stage 3: Decompile all classes ────────────────────────────────────────
    const classFiles = Object.keys(jar.jar.entries).filter(
        f => f.endsWith('.class') && !f.includes('$')
    ) as ClassFilePath[];

    const total = classFiles.length;
    let current = 0;

    const options = getDecompilerOptions(displayLambdas.value);
    await setOptions(options);

    const entries: ZipEntry[] = [];
    let localOffset = 0;

    function addText(path: string, content: string) {
        const e = textEntry(path, content, localOffset);
        entries.push(e);
        localOffset += 30 + e.name.length + e.data.length;
    }

    // Add mappings first (if available)
    if (mappingsText) {
        addText('mappings/official.txt', mappingsText);
        console.log('[256project] Mappings added to ZIP');
    } else {
        // Add a placeholder so user knows mappings weren't available
        addText('mappings/README.txt',
            `Official Mojang mappings are not available for Minecraft ${version}.\n` +
            `Mappings were introduced in snapshot 19w36a (September 2019).\n`
        );
    }

    // Decompile sources
    for (const classFilePath of classFiles) {
        if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');

        const className = classNameFromClassFilePath(classFilePath);
        let source: string;

        try {
            const result = await decompileClass(className, jar.jar, DEFAULT_VERSION);
            source = result.source;
        } catch {
            source = `// Failed to decompile: ${className}\n`;
        }

        const javaPath = 'src/' + classFilePath.replace(/\.class$/, '') + '.java';
        addText(javaPath, source);

        current++;
        onProgress({
            stage: 'decompile',
            label: `Decompiling ${current} / ${total}…`,
            current,
            total,
            className,
        });
    }

    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');

    // ── Stage 4: Build ZIP ────────────────────────────────────────────────────
    onProgress({ stage: 'zip', label: 'Building ZIP archive…' });
    return buildZip(entries);
}
