# 256project

A browser-based tool for viewing and downloading decompiled Minecraft Java Edition source code.

> Note: This project is not affiliated with Mojang or Microsoft in any way. It does NOT redistribute any Minecraft code or compiled bytecode. The Minecraft jar is downloaded directly from Mojang's servers to your browser.

## Features

- 🔍 Browse and search all classes, methods, and fields
- ⬇ **Download current file** as `.java` — or **Download entire JAR** as `.zip`
- 🔄 Version comparison (diff view)
- 🌳 Inheritance visualization graph
- 🔗 Find all references & Go to declaration
- 📋 Mixin / Class Tweaker string copy helper
- 🧩 Bytecode view mode

## How to build locally

First you must build the java project using Gradle:

- `cd java`
- `./gradlew build`

Then run the web app:

- `nvm use` (or ensure you have the correct Node version, see `.nvmrc`)
- `npm install`
- `npm run dev`

## Credits

Libraries and tools used:

- Decompiler: [Vineflower](https://github.com/Vineflower/vineflower)
- Wasm compilation of Vineflower: [@run-slicer/vf](https://www.npmjs.com/package/@run-slicer/vf)
- ZIP packaging: [@katana-project/zip](https://www.npmjs.com/package/@katana-project/zip)
- Developer [Cmmdx256](https://github.com/Cmmdx256/)

`./src/ui/intellij-icons/` includes icons from [IntelliJ Platform](https://intellij-icons.jetbrains.design), Licensed Apache 2.0.
