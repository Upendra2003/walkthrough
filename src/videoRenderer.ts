import * as path from 'path';
import * as fs from 'fs';
import { AnimationBlueprint } from '../motion/src/types';

// Cache the bundle URL across renders — only bundle once per session
let bundleCache: string | null = null;
let bundlePromise: Promise<string> | null = null;

function getMotionRoot(): string {
  // motion/ is a sibling of src/ at the project root
  return path.resolve(__dirname, '../../motion');
}

async function getBundleUrl(): Promise<string> {
  if (bundleCache) return bundleCache;
  if (bundlePromise) return bundlePromise;

  const { bundle } = await import('@remotion/bundler');

  bundlePromise = bundle({
    entryPoint: path.join(getMotionRoot(), 'src', 'index.ts'),
    webpackOverride: (config: any) => config,
  }).then((url: string) => {
    bundleCache = url;
    bundlePromise = null;
    return url;
  });

  return bundlePromise;
}

export interface RenderOptions {
  wsRoot: string;        // workspace root — videos saved here
  fileName: string;      // e.g. "auth.ts" → "auth_ts.mp4"
  blueprint: AnimationBlueprint;
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;  // cancellation support
}

export interface RenderResult {
  mp4Path: string;       // absolute path to rendered MP4
  durationMs: number;    // total video duration in ms
}

export async function renderBlockVideo(opts: RenderOptions): Promise<RenderResult> {
  const { wsRoot, fileName, blueprint, onProgress, signal } = opts;

  // Output directory inside workspace
  const outDir = path.join(wsRoot, '.vscode', 'walkthrough-videos');
  fs.mkdirSync(outDir, { recursive: true });

  // Sanitize filename
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const mp4Path = path.join(outDir, `${safeName}.mp4`);

  // If already rendered (prefetch hit), return immediately
  if (fs.existsSync(mp4Path)) {
    const { selectComposition } = await import('@remotion/renderer');
    const bundleUrl = await getBundleUrl();
    const comp = await selectComposition({
      serveUrl: bundleUrl,
      id: 'CodeExplainer',
      inputProps: { blueprint: { ...blueprint, silent: true } },
    });
    const durationMs = (comp.durationInFrames / comp.fps) * 1000;
    return { mp4Path, durationMs };
  }

  const { selectComposition, renderMedia } = await import('@remotion/renderer');
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
    onProgress: ({ progress }: { progress: number }) => {
      onProgress?.(Math.round(progress * 100));
    },
  });

  const durationMs = (composition.durationInFrames / composition.fps) * 1000;
  return { mp4Path, durationMs };
}

export function clearVideoCache(wsRoot: string): void {
  const dir = path.join(wsRoot, '.vscode', 'walkthrough-videos');
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir)
      .filter((f: string) => f.endsWith('.mp4'))
      .forEach((f: string) => fs.unlinkSync(path.join(dir, f)));
  }
  bundleCache = null;
}
