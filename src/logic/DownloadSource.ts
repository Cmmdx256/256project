/**
 * 256project - DownloadSource.ts
 *
 * Provides three download capabilities:
 *   1. downloadCurrentFile()     - downloads the currently open class as a .java file
 *   2. downloadEntireJarAsZip()  - decompiles the entire JAR and packages it as a .zip
 *   3. downloadGradleProject()   - generates a complete compilable Gradle project as a .zip
 */

import { firstValueFrom } from "rxjs";
import { minecraftJar } from "./MinecraftApi";
import { selectedFile, vineflowerVersion } from "./State";
import { displayLambdas } from "./Settings";
import { getDecompilerOptions } from "./Decompiler";
import { decompileClass, setOptions } from "../workers/decompile/client";
import { DEFAULT_VERSION } from "./vineflower/versions";
import { classNameFromClassFilePath, type ClassFilePath } from "../utils/Names";
import { generateGradleProject, type ProjectGenProgressCallback } from "./ProjectGenerator";

// ─── Helpers ────────────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function classFilePathToJavaFilePath(filePath: ClassFilePath): string {
    // net/minecraft/Foo.class  →  net/minecraft/Foo.java
    return filePath.replace(/\.class$/, "") + ".java";
}

// ─── Single File Download ────────────────────────────────────────────────────

/**
 * Decompiles the currently open class and downloads it as a .java file.
 */
export async function downloadCurrentFile(): Promise<void> {
    const jar = await firstValueFrom(minecraftJar);
    const file = selectedFile.value;

    if (!file) {
        throw new Error("No file selected");
    }

    const className = classNameFromClassFilePath(file);
    const options = getDecompilerOptions(displayLambdas.value);
    await setOptions(options);

    const result = await decompileClass(className, jar.jar, vineflowerVersion.value);

    const javaPath = classFilePathToJavaFilePath(file);
    const filename = javaPath.split("/").at(-1) ?? `${className}.java`;

    const blob = new Blob([result.source], { type: "text/plain;charset=utf-8" });
    triggerDownload(blob, filename);
}

// ─── ZIP Progress Callback ───────────────────────────────────────────────────

export type ZipProgressCallback = (current: number, total: number, className: string) => void;

// ─── Minimal ZIP Builder (stored / no-compression) ─────────────────────────
//
// We build a valid ZIP file in memory without any extra dependency.
// All files are stored uncompressed (method 0).

function crc32(data: Uint8Array): number {
    let crc = 0xFFFFFFFF;
    const table = crc32Table();
    for (let i = 0; i < data.length; i++) {
        crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

let _crc32Table: Uint32Array | null = null;
function crc32Table(): Uint32Array {
    if (_crc32Table) return _crc32Table;
    _crc32Table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        _crc32Table[i] = c;
    }
    return _crc32Table;
}

function writeUint16LE(buf: DataView, offset: number, val: number) {
    buf.setUint16(offset, val, true);
}
function writeUint32LE(buf: DataView, offset: number, val: number) {
    buf.setUint32(offset, val, true);
}

interface ZipEntry {
    name: Uint8Array;
    data: Uint8Array;
    crc: number;
    offset: number;
}

function buildZip(entries: ZipEntry[]): Blob {
    const parts: Uint8Array[] = [];
    let offset = 0;

    // Local file headers + data
    for (const entry of entries) {
        const header = new ArrayBuffer(30 + entry.name.length);
        const dv = new DataView(header);
        writeUint32LE(dv, 0, 0x04034b50);   // signature
        writeUint16LE(dv, 4, 20);            // version needed
        writeUint16LE(dv, 6, 0);             // flags
        writeUint16LE(dv, 8, 0);             // method: stored
        writeUint16LE(dv, 10, 0);            // mod time
        writeUint16LE(dv, 12, 0);            // mod date
        writeUint32LE(dv, 14, entry.crc);    // crc32
        writeUint32LE(dv, 18, entry.data.length); // compressed size
        writeUint32LE(dv, 22, entry.data.length); // uncompressed size
        writeUint16LE(dv, 26, entry.name.length); // filename length
        writeUint16LE(dv, 28, 0);            // extra length
        new Uint8Array(header, 30).set(entry.name);
        parts.push(new Uint8Array(header));
        parts.push(entry.data);
        offset += header.byteLength + entry.data.length;
    }

    // Central directory
    const cdOffset = offset;
    for (const entry of entries) {
        const cd = new ArrayBuffer(46 + entry.name.length);
        const dv = new DataView(cd);
        writeUint32LE(dv, 0, 0x02014b50);   // signature
        writeUint16LE(dv, 4, 20);            // version made by
        writeUint16LE(dv, 6, 20);            // version needed
        writeUint16LE(dv, 8, 0);             // flags
        writeUint16LE(dv, 10, 0);            // method: stored
        writeUint16LE(dv, 12, 0);            // mod time
        writeUint16LE(dv, 14, 0);            // mod date
        writeUint32LE(dv, 16, entry.crc);
        writeUint32LE(dv, 20, entry.data.length);
        writeUint32LE(dv, 24, entry.data.length);
        writeUint16LE(dv, 28, entry.name.length);
        writeUint16LE(dv, 30, 0);            // extra length
        writeUint16LE(dv, 32, 0);            // comment length
        writeUint16LE(dv, 34, 0);            // disk start
        writeUint16LE(dv, 36, 0);            // int attrs
        writeUint32LE(dv, 38, 0);            // ext attrs
        writeUint32LE(dv, 42, entry.offset); // local header offset
        new Uint8Array(cd, 46).set(entry.name);
        parts.push(new Uint8Array(cd));
        offset += cd.byteLength;
    }

    const cdSize = offset - cdOffset;

    // End of central directory record
    const eocd = new ArrayBuffer(22);
    const dv = new DataView(eocd);
    writeUint32LE(dv, 0, 0x06054b50);       // signature
    writeUint16LE(dv, 4, 0);                 // disk number
    writeUint16LE(dv, 6, 0);                 // disk with start
    writeUint16LE(dv, 8, entries.length);    // entries on this disk
    writeUint16LE(dv, 10, entries.length);   // total entries
    writeUint32LE(dv, 12, cdSize);           // central dir size
    writeUint32LE(dv, 16, cdOffset);         // central dir offset
    writeUint16LE(dv, 20, 0);               // comment length
    parts.push(new Uint8Array(eocd));

    return new Blob(parts as BlobPart[], { type: "application/zip" });
}

// ─── Full JAR ZIP Download ───────────────────────────────────────────────────

const enc = new TextEncoder();

/**
 * Decompiles every class in the currently loaded JAR and downloads a .zip
 * that preserves the original package structure (e.g. net/minecraft/Foo.java).
 */
export async function downloadEntireJarAsZip(
    onProgress?: ZipProgressCallback,
    signal?: AbortSignal
): Promise<void> {
    const jar = await firstValueFrom(minecraftJar);
    const version = jar.version;

    // Collect all outer classes (no inner classes like Foo$Bar)
    const classFiles = Object.keys(jar.jar.entries).filter(
        f => f.endsWith(".class") && !f.includes("$")
    ) as ClassFilePath[];

    const total = classFiles.length;
    let current = 0;
    let localOffset = 0;

    const options = getDecompilerOptions(displayLambdas.value);
    await setOptions(options);

    const zipEntries: ZipEntry[] = [];

    // Decompile class by class and add to zip
    for (const classFilePath of classFiles) {
        if (signal?.aborted) {
            throw new DOMException("Cancelled", "AbortError");
        }

        const className = classNameFromClassFilePath(classFilePath);
        let source: string;

        try {
            const result = await decompileClass(className, jar.jar, DEFAULT_VERSION);
            source = result.source;
        } catch {
            source = `// Failed to decompile: ${className}\n`;
        }

        const javaPath = classFilePath.replace(/\.class$/, "") + ".java";
        const nameBytes = enc.encode(javaPath);
        const dataBytes = enc.encode(source);
        const checksum = crc32(dataBytes);

        zipEntries.push({
            name: nameBytes,
            data: dataBytes,
            crc: checksum,
            offset: localOffset,
        });

        // local file header (30) + name length + data length
        localOffset += 30 + nameBytes.length + dataBytes.length;

        current++;
        onProgress?.(current, total, className);
    }

    const zipBlob = buildZip(zipEntries);
    triggerDownload(zipBlob, `${version}-src.zip`);
}

// ─── Source Code Download ─────────────────────────────────────────────────────

export type { ProjectGenProgressCallback };
export { type ProjectGenStage } from "./ProjectGenerator";

/**
 * Downloads the decompiled Minecraft source code + official Mojang mappings as a ZIP.
 */
export async function downloadGradleProject(
    onProgress: ProjectGenProgressCallback,
    signal?: AbortSignal
): Promise<void> {
    const jar = await firstValueFrom(minecraftJar);
    const version = jar.version;

    const zipBlob = await generateGradleProject(onProgress, signal);
    triggerDownload(zipBlob, `${version}-src.zip`);
}
