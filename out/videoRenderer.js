"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderBlockVideo = renderBlockVideo;
exports.clearVideoCache = clearVideoCache;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
// Cache the bundle URL across renders — only bundle once per session
let bundleCache = null;
let bundlePromise = null;
function getMotionRoot() {
    // __dirname at runtime = Walkthrough/out/ → one level up reaches project root
    return path.resolve(__dirname, '../motion');
}
async function getBundleUrl() {
    if (bundleCache)
        return bundleCache;
    if (bundlePromise)
        return bundlePromise;
    const { bundle } = await Promise.resolve().then(() => __importStar(require('@remotion/bundler')));
    bundlePromise = bundle({
        entryPoint: path.join(getMotionRoot(), 'src', 'index.ts'),
        webpackOverride: (config) => config,
    }).then((url) => {
        bundleCache = url;
        bundlePromise = null;
        return url;
    });
    return bundlePromise;
}
async function renderBlockVideo(opts) {
    const { wsRoot, fileName, blueprint, onProgress, signal } = opts;
    // Output directory inside workspace
    const outDir = path.join(wsRoot, '.vscode', 'walkthrough-videos');
    fs.mkdirSync(outDir, { recursive: true });
    // Sanitize filename
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const mp4Path = path.join(outDir, `${safeName}.mp4`);
    // If already rendered (prefetch hit), return immediately
    if (fs.existsSync(mp4Path)) {
        const { selectComposition } = await Promise.resolve().then(() => __importStar(require('@remotion/renderer')));
        const bundleUrl = await getBundleUrl();
        const comp = await selectComposition({
            serveUrl: bundleUrl,
            id: 'CodeExplainer',
            inputProps: { blueprint: { ...blueprint, silent: true } },
        });
        const durationMs = (comp.durationInFrames / comp.fps) * 1000;
        return { mp4Path, durationMs };
    }
    const { selectComposition, renderMedia } = await Promise.resolve().then(() => __importStar(require('@remotion/renderer')));
    const bundleUrl = await getBundleUrl();
    const inputProps = { blueprint: { ...blueprint, silent: true } };
    const composition = await selectComposition({
        serveUrl: bundleUrl,
        id: 'CodeExplainer',
        inputProps,
    });
    await renderMedia({
        composition,
        serveUrl: bundleUrl,
        codec: 'h264',
        outputLocation: mp4Path,
        inputProps,
        concurrency: 2,
        onProgress: ({ progress }) => {
            onProgress?.(Math.round(progress * 100));
        },
    });
    const durationMs = (composition.durationInFrames / composition.fps) * 1000;
    return { mp4Path, durationMs };
}
function clearVideoCache(wsRoot) {
    const dir = path.join(wsRoot, '.vscode', 'walkthrough-videos');
    if (fs.existsSync(dir)) {
        fs.readdirSync(dir)
            .filter((f) => f.endsWith('.mp4'))
            .forEach((f) => fs.unlinkSync(path.join(dir, f)));
    }
    bundleCache = null;
}
//# sourceMappingURL=videoRenderer.js.map