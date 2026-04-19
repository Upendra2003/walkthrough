import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path from 'path';
import { sampleBlueprint } from './src/sampleBlueprint';

async function main() {
  console.log('📦 Bundling...');
  const bundled = await bundle({
    entryPoint: path.resolve(__dirname, './src/index.ts'),
    webpackOverride: (config) => config,
  });

  console.log('🎬 Selecting composition...');
  const composition = await selectComposition({
    serveUrl: bundled,
    id: 'CodeExplainer',
    inputProps: { blueprint: sampleBlueprint },
  });

  const outputPath = path.resolve(__dirname, './output/sample.mp4');
  console.log('🎥 Rendering to', outputPath, '...');
  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps: { blueprint: sampleBlueprint },
    onProgress: ({ progress }) => {
      process.stdout.write(`\r⏳ ${Math.round(progress * 100)}%`);
    },
  });

  console.log('\n✅ Done! output/sample.mp4');
}

main().catch(console.error);
