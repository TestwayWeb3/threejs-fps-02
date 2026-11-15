// main.ts — the entry program for Cinder Quay.
// Copies the whole game/ and screenshots/ directories from this
// repository into the output directory, then writes dossier.json with
// buildDossier from the kit's vendored library. The output directory
// comes from MAKEFUN_OUTPUT_DIR when set, and defaults to /output.
// Paths resolve from this file's own location, so the program works
// from any working directory. Two runs write identical bytes.

import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-threejs.ts";

const root = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";

mkdirSync(outDir, { recursive: true });
cpSync(join(root, "game"), join(outDir, "game"), { recursive: true });
cpSync(join(root, "screenshots"), join(outDir, "screenshots"), { recursive: true });
const dossier = buildDossier(outDir, { text_max_bytes: 163840 });
writeFileSync(join(outDir, "dossier.json"), dossier);
