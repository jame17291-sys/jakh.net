#!/usr/bin/env node

// Kept as the public generator entry point used by CI and release workflows.
// The implementation lives in a dedicated Riddle Arabia generator so the old
// mass-page program cannot be reintroduced accidentally.
import "./generate-site-navigation.mjs";
import "./generate-riddlearabia-seo.mjs";
import { generatePuzzlePages } from "./generate-puzzle-pages.mjs";
await generatePuzzlePages({ check: process.argv.includes("--check") });
