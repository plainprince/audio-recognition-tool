import { parseArgs, hasFlag } from './src/config.js';

// Show help
function showHelp() {
  console.log('Audio Recognition Tool - Audio Fingerprinting');
  console.log('=====================================\n');
  console.log('Usage:');
  console.log('  bun index.js --parse      Parse audio files from audio_input/');
  console.log('  bun index.js --detect     Detect song from input.* file');
  console.log('  bun index.js --detect --mic   Detect song from microphone\n');
  console.log('Options:');
  console.log('  --parse               Run parser to index audio files');
  console.log('  --detect              Run detector to identify songs');
  console.log('  --mic                 Use microphone input (with --detect)');
  console.log('  --save-mic            Save microphone input as MP3 for debugging');
  console.log('  --input PATH          Specify input file path (with --detect)');
  console.log('  --top N               Show top N results (default: 5, use 1 to hide list)');
  console.log('  --window MS           Window size in milliseconds (default: 100)');
  console.log('  --overlap 0-1         Overlap ratio (default: 0.5)');
  console.log('  --input-dir PATH      Custom input directory (with --parse)');
  console.log('  --processed-dir PATH  Custom processed directory (with --parse)');
  console.log('  --db-path PATH        Custom database path');
  console.log('  --help                Show this help message\n');
  console.log('Examples:');
  console.log('  bun index.js --parse');
  console.log('  bun index.js --detect');
  console.log('  bun index.js --detect --top 1');
  console.log('  bun index.js --detect --top 10');
  console.log('  bun index.js --detect --input ./my_audio/song.mp3');
  console.log('  bun index.js --detect --mic --save-mic');
  console.log('  bun index.js --parse --window 150 --overlap 0.6');
}

async function main() {
  const isParse = hasFlag('--parse');
  const isDetect = hasFlag('--detect');
  const showHelpFlag = hasFlag('--help');

  if (showHelpFlag || (!isParse && !isDetect)) {
    showHelp();
    process.exit(0);
  }

  if (isParse && isDetect) {
    console.error('Error: Cannot use --parse and --detect together');
    process.exit(1);
  }

  if (isParse) {
    // Run parser
    const { runParser } = await import('./src/parser.js');
    await runParser();
  } else if (isDetect) {
    // Run detector
    const { runDetector } = await import('./src/detector.js');
    await runDetector();
  }
}

main().catch(console.error);

