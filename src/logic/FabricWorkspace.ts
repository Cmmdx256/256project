/**
 * 256project — FabricWorkspace.ts
 *
 * Generates a complete, runnable Fabric Loom development workspace for the
 * currently selected Minecraft version.
 *
 * The output ZIP can be extracted and run with:
 *   ./gradlew runClient
 */

// ─── Progress ────────────────────────────────────────────────────────────────

export type FabricWorkspaceStage =
    | { stage: 'fabric-meta'; label: string }
    | { stage: 'files'; label: string }
    | { stage: 'zip'; label: string };

export type FabricWorkspaceProgressCallback = (progress: FabricWorkspaceStage) => void;

// ─── Fabric Meta API types ────────────────────────────────────────────────────

interface FabricGameVersion {
    version: string;
    stable: boolean;
}

interface FabricLoaderVersion {
    version: string;
    stable: boolean;
}

const FABRIC_META_BASE = 'https://meta.fabricmc.net/v2';
const FABRIC_MAVEN_META = 'https://maven.fabricmc.net/net/fabricmc/fabric-api/fabric-api/maven-metadata.xml';

async function getJson<T>(url: string): Promise<T> {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);
    return resp.json() as Promise<T>;
}

function getJavaVersion(mcVersion: string): number {
    const parts = mcVersion.split('.').map(Number);
    if (parts[0] >= 26) return 25; // 26.x unobfuscated snapshots
    if (parts[0] === 1) {
        const minor = parts[1];
        const patch = parts[2] ?? 0;
        if (minor >= 21) return 21;
        if (minor === 20 && patch >= 5) return 21; // 1.20.5+ requires Java 21
        if (minor >= 18) return 17; // 1.18 - 1.20.4 requires Java 17
        if (minor === 17) return 16; // 1.17 requires Java 16
        return 8; // 1.14 - 1.16 requires Java 8
    }
    return 21;
}

async function fetchFabricVersions(mcVersion: string): Promise<{
    loaderVersion: string;
    fabricApiVersion: string;
    javaVersion: number;
}> {
    // 1. Check Fabric support for this MC version
    const gameVersions = await getJson<FabricGameVersion[]>(`${FABRIC_META_BASE}/versions/game`);
    const isSupported = gameVersions.some(v => v.version === mcVersion);
    if (!isSupported) {
        throw new Error(
            `Minecraft ${mcVersion} is not yet supported by Fabric Loom.\n` +
            `Supported versions: ${gameVersions.slice(0, 5).map(v => v.version).join(', ')}...`
        );
    }

    // 2. Latest stable Fabric Loader
    const loaderVersions = await getJson<FabricLoaderVersion[]>(`${FABRIC_META_BASE}/versions/loader`);
    const loaderVersion = (loaderVersions.find(v => v.stable) ?? loaderVersions[0]).version;

    // 3. Fabric API version from Maven metadata (filter by +{mcVersion} suffix)
    let fabricApiVersion = '';
    try {
        const resp = await fetch(FABRIC_MAVEN_META);
        if (resp.ok) {
            const xml = await resp.text();
            const all = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map(m => m[1]);
            const matching = all.filter(v => v.endsWith('+' + mcVersion));
            if (matching.length > 0) {
                fabricApiVersion = matching[matching.length - 1];
            }
        }
    } catch {
        // Fall through to fallback
    }
    if (!fabricApiVersion) {
        fabricApiVersion = `0.116.17+${mcVersion}`;
        console.warn('[FabricWorkspace] Using fallback Fabric API version:', fabricApiVersion);
    }

    // 4. Target Java version
    const javaVersion = getJavaVersion(mcVersion);

    return { loaderVersion, fabricApiVersion, javaVersion };
}

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

// ─── File Templates ──────────────────────────────────────────────────────────

function tplBuildGradle(javaVersion: number): string {
    return `plugins {
\tid 'net.fabricmc.fabric-loom-remap' version "\${project.loom_version}"
\tid 'maven-publish'
}

version = project.mod_version
group = project.maven_group

base {
\tarchivesName = project.archives_base_name
}

repositories {
\t// Add repositories here when depending on other mods.
}

loom {
\tsplitEnvironmentSourceSets()

\tmods {
\t\t"examplemod" {
\t\t\tsourceSet sourceSets.main
\t\t\tsourceSet sourceSets.client
\t\t}
\t}
}

dependencies {
\tminecraft "com.mojang:minecraft:\${project.minecraft_version}"
\tmappings loom.officialMojangMappings()
\tmodImplementation "net.fabricmc:fabric-loader:\${project.loader_version}"

\t// Fabric API
\tmodImplementation "net.fabricmc.fabric-api:fabric-api:\${project.fabric_version}"
}

processResources {
\tinputs.property "version", project.mod_version
\tfilesMatching("fabric.mod.json") {
\t\texpand "version": project.mod_version
\t}
}

tasks.withType(JavaCompile).configureEach {
\tit.options.release = ${javaVersion}
}

java {
\twithSourcesJar()
\tsourceCompatibility = JavaVersion.toVersion(${javaVersion})
\ttargetCompatibility = JavaVersion.toVersion(${javaVersion})
}

jar {
\tfrom("LICENSE") {
\t\trename { "\${it}_\${project.archives_base_name}" }
\t}
}
`;
}

function tplSettingsGradle(): string {
    return `pluginManagement {
\trepositories {
\t\tmaven {
\t\t\tname = 'Fabric'
\t\t\turl = 'https://maven.fabricmc.net/'
\t\t}
\t\tmavenCentral()
\t\tgradlePluginPortal()
\t}
}
`;
}

function tplGradleProperties(mcVersion: string, loaderVersion: string, fabricApiVersion: string): string {
    return `# Increase Gradle memory
org.gradle.jvmargs=-Xmx2G
org.gradle.parallel=true
org.gradle.configuration-cache=false

# Fabric Properties
# Check these on https://fabricmc.net/develop
minecraft_version=${mcVersion}
loader_version=${loaderVersion}
loom_version=1.17-SNAPSHOT
fabric_version=${fabricApiVersion}

# Mod Properties
mod_version=1.0.0
maven_group=com.example
archives_base_name=examplemod
`;
}

function tplGradleWrapperProperties(): string {
    return `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-9.5.1-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`;
}

function tplGradlew(): string {
    // Use regular string to avoid template literal issues with shell $VARNAME syntax
    const S = '$'; // dollar sign shorthand
    return '#!/bin/sh\n' +
        '#\n' +
        '# Gradle startup script for POSIX generated by the Gradle init task.\n' +
        '#\n' +
        '\n' +
        '# Attempt to set APP_HOME\n' +
        '# Resolve links: ' + S + '0 may be a link\n' +
        'app_path=' + S + '0\n' +
        '\n' +
        'while\n' +
        '    APP_HOME=' + S + '{app_path%"' + S + '{app_path##*/}"}  # leaves a trailing /; empty if no leading path\n' +
        '    [ -h "' + S + 'app_path" ]\n' +
        'do\n' +
        '    ls=' + S + '( ls -ld "' + S + 'app_path" )\n' +
        '    link=' + S + '{ls#*\' -> \'}\n' +
        '    case ' + S + 'link in             #(\n' +
        '      /*)   app_path=' + S + 'link ;; #( absolute\n' +
        '      *)    app_path=' + S + 'APP_HOME' + S + 'link ;; #( relative\n' +
        '    esac\n' +
        'done\n' +
        '\n' +
        'APP_HOME=' + S + '( cd "' + S + '{APP_HOME:-./}" && pwd -P ) || exit\n' +
        '\n' +
        'APP_NAME="Gradle"\n' +
        'APP_BASE_NAME=' + S + '{0##*/}\n' +
        '\n' +
        '# Add default JVM options here. You can also use JAVA_OPTS and GRADLE_OPTS.\n' +
        'DEFAULT_JVM_OPTS=\'"-Xmx64m" "-Xms64m"\'\n' +
        '\n' +
        'MAX_FD=maximum\n' +
        '\n' +
        'warn () {\n' +
        '    echo "' + S + '*"\n' +
        '} >&2\n' +
        '\n' +
        'die () {\n' +
        '    echo\n' +
        '    echo "' + S + '*"\n' +
        '    echo\n' +
        '    exit 1\n' +
        '} >&2\n' +
        '\n' +
        'cygwin=false\n' +
        'msys=false\n' +
        'darwin=false\n' +
        'nonstop=false\n' +
        'case "' + S + '( uname )" in\n' +
        '  CYGWIN* )         cygwin=true  ;;\n' +
        '  Darwin* )         darwin=true  ;;\n' +
        '  MSYS* | MINGW* )  msys=true   ;;\n' +
        '  NONSTOP* )        nonstop=true ;;\n' +
        'esac\n' +
        '\n' +
        'CLASSPATH=' + S + 'APP_HOME/gradle/wrapper/gradle-wrapper.jar\n' +
        '\n' +
        'if [ -n "' + S + 'JAVA_HOME" ] ; then\n' +
        '    if [ -x "' + S + 'JAVA_HOME/jre/sh/java" ] ; then\n' +
        '        JAVACMD=' + S + 'JAVA_HOME/jre/sh/java\n' +
        '    else\n' +
        '        JAVACMD=' + S + 'JAVA_HOME/bin/java\n' +
        '    fi\n' +
        '    if [ ! -x "' + S + 'JAVACMD" ] ; then\n' +
        '        die "ERROR: JAVA_HOME is set to an invalid directory: ' + S + 'JAVA_HOME"\n' +
        '    fi\n' +
        'else\n' +
        '    JAVACMD=java\n' +
        '    if ! command -v java >/dev/null 2>&1\n' +
        '    then\n' +
        '        die "ERROR: JAVA_HOME is not set and no java command could be found in your PATH."\n' +
        '    fi\n' +
        'fi\n' +
        '\n' +
        'set -- \\\n' +
        '        "-Dorg.gradle.appname=' + S + 'APP_BASE_NAME" \\\n' +
        '        -classpath "' + S + 'CLASSPATH" \\\n' +
        '        org.gradle.wrapper.GradleWrapperMain \\\n' +
        '        "' + S + '@"\n' +
        '\n' +
        'exec "' + S + 'JAVACMD" "' + S + 'DEFAULT_JVM_OPTS" ' + S + 'JAVA_OPTS ' + S + 'GRADLE_OPTS "' + S + '@"\n';
}

function tplGradlewBat(): string {
    return '@rem\n' +
        '@rem Gradle startup script for Windows\n' +
        '@rem\n' +
        '@if "%DEBUG%"=="" @echo off\n' +
        '\n' +
        'if "%OS%"=="Windows_NT" setlocal\n' +
        '\n' +
        'set DIRNAME=%~dp0\n' +
        'if "%DIRNAME%"=="" set DIRNAME=.\n' +
        'set APP_BASE_NAME=%~n0\n' +
        'set APP_HOME=%DIRNAME%\n' +
        '\n' +
        'for %%i in ("%APP_HOME%") do set APP_HOME=%%~fi\n' +
        '\n' +
        'set DEFAULT_JVM_OPTS="-Xmx64m" "-Xms64m"\n' +
        '\n' +
        'if defined JAVA_HOME goto findJavaFromJavaHome\n' +
        '\n' +
        'set JAVA_EXE=java.exe\n' +
        '%JAVA_EXE% -version >NUL 2>&1\n' +
        'if %ERRORLEVEL% equ 0 goto execute\n' +
        '\n' +
        'echo. 1>&2\n' +
        'echo ERROR: JAVA_HOME is not set and no java command could be found in your PATH. 1>&2\n' +
        'goto fail\n' +
        '\n' +
        ':findJavaFromJavaHome\n' +
        'set JAVA_HOME=%JAVA_HOME:"=%\n' +
        'set JAVA_EXE=%JAVA_HOME%/bin/java.exe\n' +
        'if exist "%JAVA_EXE%" goto execute\n' +
        '\n' +
        'echo. 1>&2\n' +
        'echo ERROR: JAVA_HOME is set to an invalid directory: %JAVA_HOME% 1>&2\n' +
        'goto fail\n' +
        '\n' +
        ':execute\n' +
        'set CLASSPATH=%APP_HOME%\\gradle\\wrapper\\gradle-wrapper.jar\n' +
        '"%JAVA_EXE%" %DEFAULT_JVM_OPTS% %JAVA_OPTS% %GRADLE_OPTS% "-Dorg.gradle.appname=%APP_BASE_NAME%" -classpath "%CLASSPATH%" org.gradle.wrapper.GradleWrapperMain %*\n' +
        '\n' +
        ':end\n' +
        'if %ERRORLEVEL% equ 0 goto mainEnd\n' +
        '\n' +
        ':fail\n' +
        'set EXIT_CODE=%ERRORLEVEL%\n' +
        'if %EXIT_CODE% equ 0 set EXIT_CODE=1\n' +
        'if not ""=="%GRADLE_EXIT_CONSOLE%" exit %EXIT_CODE%\n' +
        'exit /b %EXIT_CODE%\n' +
        '\n' +
        ':mainEnd\n' +
        'if "%OS%"=="Windows_NT" endlocal\n' +
        '\n' +
        ':omega\n';
}

function tplExampleModJava(): string {
    return `package com.example;

import net.fabricmc.api.ModInitializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class ExampleMod implements ModInitializer {
    public static final String MOD_ID = "examplemod";
    public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    @Override
    public void onInitialize() {
        // This code runs as soon as Minecraft is in a mod-load-ready state.
        // However, some things (like resources) may still be uninitialized.
        // Proceed with mild caution.

        LOGGER.info("Hello Fabric world!");
    }
}
`;
}

function tplExampleModClientJava(): string {
    return `package com.example;

import net.fabricmc.api.ClientModInitializer;

public class ExampleModClient implements ClientModInitializer {
    @Override
    public void onInitializeClient() {
        // This entrypoint is suitable for setting up client-specific logic,
        // such as rendering.
    }
}
`;
}

function tplFabricModJson(mcVersion: string, loaderVersion: string, javaVersion: number): string {
    const parts = mcVersion.split('.');
    const majorMinor = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : mcVersion;

    return JSON.stringify({
        schemaVersion: 1,
        id: "examplemod",
        version: "${version}",
        name: "Example Mod",
        description: "A minimal Fabric mod for Minecraft " + mcVersion,
        authors: ["Me!"],
        contact: {
            homepage: "https://fabricmc.net/",
            sources: "https://github.com/FabricMC/fabric-example-mod"
        },
        license: "CC0-1.0",
        icon: "assets/examplemod/icon.png",
        environment: "*",
        entrypoints: {
            main: ["com.example.ExampleMod"],
            client: ["com.example.ExampleModClient"]
        },
        mixins: [
            "examplemod.mixins.json",
            { config: "examplemod.client.mixins.json", environment: "client" }
        ],
        depends: {
            fabricloader: `>=${loaderVersion}`,
            minecraft: `~${majorMinor}`,
            java: `>=${javaVersion}`,
            "fabric-api": "*"
        }
    }, null, 2);
}

function tplMixinsJson(pkg: string): string {
    return JSON.stringify({
        required: true,
        minVersion: "0.8",
        package: pkg,
        compatibilityLevel: "JAVA_21",
        mixins: [],
        injectors: { defaultRequire: 1 }
    }, null, 2);
}

function tplReadme(mcVersion: string, javaVersion: number): string {
    return `# Minecraft ${mcVersion} Fabric Workspace

Generated by [256project](https://cmmdx256.github.io/256project/)

## Requirements

- **Java ${javaVersion}+** ([Adoptium](https://adoptium.net/))
- Internet connection (Gradle will download Minecraft and dependencies on first run)

## Getting Started

### Launch the game (no changes needed)

**Linux / macOS:**
\`\`\`bash
chmod +x gradlew
./gradlew runClient
\`\`\`

**Windows:**
\`\`\`bat
gradlew.bat runClient
\`\`\`

Gradle will automatically download everything on the first run (~500MB).

### Open in IntelliJ IDEA

1. Open IntelliJ IDEA → **Open** → select this folder
2. Wait for Gradle to sync
3. Run \`Minecraft Client\` from the run configurations

### Add your own code

- Edit \`src/main/java/com/example/ExampleMod.java\`
- Add Mixins in \`src/main/java/com/example/mixin/\`
- See [Fabric Wiki](https://fabricmc.net/wiki/) for tutorials

### Build a .jar mod

\`\`\`bash
./gradlew build
\`\`\`

The output will be at \`build/libs/examplemod-1.0.0.jar\`.

---

*Workspace generated for Minecraft ${mcVersion} with official Mojang mappings.*
`;
}

// ─── Main Export ─────────────────────────────────────────────────────────────

const enc = new TextEncoder();

function addText(entries: ZipEntry[], localOffset: { v: number }, path: string, content: string) {
    const name = enc.encode(path);
    const data = enc.encode(content);
    entries.push({ name, data, crc: crc32(data), offset: localOffset.v });
    localOffset.v += 30 + name.length + data.length;
}

function addBinary(entries: ZipEntry[], localOffset: { v: number }, path: string, data: Uint8Array) {
    const name = enc.encode(path);
    entries.push({ name, data, crc: crc32(data), offset: localOffset.v });
    localOffset.v += 30 + name.length + data.length;
}

export async function generateFabricWorkspace(
    mcVersion: string,
    onProgress: FabricWorkspaceProgressCallback,
    signal?: AbortSignal
): Promise<Blob> {
    // ── Stage 1: Fetch Fabric meta ────────────────────────────────────────────
    onProgress({ stage: 'fabric-meta', label: `Checking Fabric support for Minecraft ${mcVersion}…` });

    const { loaderVersion, fabricApiVersion, javaVersion } = await fetchFabricVersions(mcVersion);
    console.log('[FabricWorkspace]', { mcVersion, loaderVersion, fabricApiVersion, javaVersion });

    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');

    // ── Stage 2: Generate files ────────────────────────────────────────────────
    onProgress({ stage: 'files', label: 'Generating project files…' });

    const entries: ZipEntry[] = [];
    const off = { v: 0 };

    addText(entries, off, 'build.gradle', tplBuildGradle(javaVersion));
    addText(entries, off, 'settings.gradle', tplSettingsGradle());
    addText(entries, off, 'gradle.properties', tplGradleProperties(mcVersion, loaderVersion, fabricApiVersion));
    addText(entries, off, 'gradle/wrapper/gradle-wrapper.properties', tplGradleWrapperProperties());
    addText(entries, off, 'gradlew', tplGradlew());
    addText(entries, off, 'gradlew.bat', tplGradlewBat());
    addText(entries, off, 'src/main/java/com/example/ExampleMod.java', tplExampleModJava());
    addText(entries, off, 'src/client/java/com/example/ExampleModClient.java', tplExampleModClientJava());
    addText(entries, off, 'src/main/resources/fabric.mod.json', tplFabricModJson(mcVersion, loaderVersion, javaVersion));
    addText(entries, off, 'src/main/resources/examplemod.mixins.json', tplMixinsJson('com.example.mixin'));
    addText(entries, off, 'src/client/resources/examplemod.client.mixins.json', tplMixinsJson('com.example.mixin.client'));
    addText(entries, off, 'README.md', tplReadme(mcVersion, javaVersion));

    // Include gradle-wrapper.jar (served from our own public/ folder)
    try {
        const wrapperUrl = (import.meta.env.BASE_URL as string).replace(/\/?$/, '/') + 'gradle-wrapper.jar';
        const wrapperResp = await fetch(wrapperUrl);
        if (wrapperResp.ok) {
            const wrapperData = new Uint8Array(await wrapperResp.arrayBuffer());
            addBinary(entries, off, 'gradle/wrapper/gradle-wrapper.jar', wrapperData);
        } else {
            console.warn('[FabricWorkspace] gradle-wrapper.jar not found at', wrapperUrl);
        }
    } catch (e) {
        console.warn('[FabricWorkspace] Could not fetch gradle-wrapper.jar:', e);
    }

    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');

    // ── Stage 3: Build ZIP ────────────────────────────────────────────────────
    onProgress({ stage: 'zip', label: 'Building ZIP archive…' });
    return buildZip(entries);
}
