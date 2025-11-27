import { readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import { processAudioToFingerprint, matchFingerprint } from './algorithm.js';
import { parseArgs, hasFlag } from './config.js';
import { existsSync } from 'node:fs';
import * as colors from 'yoctocolors';

async function loadDatabase(dbPath) {
  try {
    const file = Bun.file(dbPath);
    const data = await file.json();
    return data;
  } catch {
    return { songs: [] };
  }
}

async function findInputFile() {
  const currentDir = './';
  const files = await readdir(currentDir);
  
  const inputFile = files.find(file => {
    const lowerFile = file.toLowerCase();
    return lowerFile.startsWith('input.') && 
           ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'wma'].some(ext => 
             lowerFile.endsWith('.' + ext)
           );
  });
  
  return inputFile ? join(currentDir, inputFile) : null;
}

async function processAudioFromFile(filePath, windowSize, overlap) {
  const tempWavPath = `/tmp/shazam_temp_${Date.now()}.wav`;
  
  try {
    console.log(`Loading: ${filePath}\n`);
    
    // Convert to WAV using ffmpeg for reliable decoding
    await $`ffmpeg -i ${filePath} -ar 44100 -ac 1 -y ${tempWavPath}`.quiet();
    
    // Read WAV file manually (simple WAV parser)
    const wavFile = Bun.file(tempWavPath);
    const wavBuffer = await wavFile.arrayBuffer();
    const view = new DataView(wavBuffer);
    
    // Parse WAV header
    let offset = 12;
    while (offset < view.byteLength - 8) {
      const chunkId = String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3)
      );
      const chunkSize = view.getUint32(offset + 4, true);
      
      if (chunkId === 'fmt ') {
        const sampleRate = view.getUint32(offset + 12, true);
        offset += 8 + chunkSize;
        
        while (offset < view.byteLength - 8) {
          const dataChunkId = String.fromCharCode(
            view.getUint8(offset),
            view.getUint8(offset + 1),
            view.getUint8(offset + 2),
            view.getUint8(offset + 3)
          );
          const dataChunkSize = view.getUint32(offset + 4, true);
          
          if (dataChunkId === 'data') {
            const pcmData = new Int16Array(wavBuffer, offset + 8, dataChunkSize / 2);
            const channelData = new Float32Array(pcmData.length);
            for (let i = 0; i < pcmData.length; i++) {
              channelData[i] = pcmData[i] / 32768.0;
            }
            
            const duration = channelData.length / sampleRate;
            
            console.log(`Sample rate: ${sampleRate} Hz`);
            console.log(`Duration: ${duration.toFixed(2)} seconds\n`);
            
            const audioData = {
              audioBuffer: channelData,
              sampleRate: sampleRate,
            };
            
            const fingerprint = processAudioToFingerprint(audioData, {
              windowSize,
              overlap,
            });
            
            return fingerprint;
          }
          
          offset += 8 + dataChunkSize;
        }
        
        throw new Error('No data chunk found in WAV file');
      }
      
      offset += 8 + chunkSize;
    }
    
    throw new Error('No fmt chunk found in WAV file');
  } catch (error) {
    console.error('Error processing audio file:', error.message || error);
    return null;
  } finally {
    try {
      if (existsSync(tempWavPath)) {
        await unlink(tempWavPath);
      }
    } catch {}
  }
}

async function recordFromMicrophone(windowSize, overlap, saveMicInput) {
  console.log('Microphone mode - Recording...');
  console.log('Press Enter to stop recording\n');
  
  try {
    // Import node-mic package
    const NodeMic = (await import('mic')).default;
    
    const sampleRate = 44100;
    const chunks = [];
    
    const micInstance = new NodeMic({
      rate: sampleRate,
      channels: 1,
      bitwidth: 16,
      encoding: 'signed-integer',
      threshold: 0,
      fileType: 'raw',
      debug: false,
    });
    
    const micInputStream = micInstance.getAudioStream();
    
    micInputStream.on('data', (data) => {
      chunks.push(Buffer.from(data));
    });
    
    micInputStream.on('error', (err) => {
      console.error(`Microphone error: ${err.message}`);
    });
    
    micInstance.start();
    
    // Wait for Enter key press
    process.stdin.setRawMode(true);
    process.stdin.resume();
    
    await new Promise((resolve) => {
      const onData = (key) => {
        // Check for Enter key (code 13 or 10)
        if (key[0] === 13 || key[0] === 10) {
          process.stdin.removeListener('data', onData);
          resolve();
        }
        // Check for Ctrl+C
        if (key[0] === 3) {
          process.exit(0);
        }
      };
      process.stdin.on('data', onData);
    });
    
    micInstance.stop();
    process.stdin.setRawMode(false);
    process.stdin.pause();
    
    console.log('\nRecording stopped. Processing...\n');
    
    // Combine all chunks into a single buffer
    const combinedBuffer = Buffer.concat(chunks);
    
    console.log(colors.dim(`Recorded ${chunks.length} chunks, total ${combinedBuffer.length} bytes`));
    
    if (combinedBuffer.length === 0) {
      console.error(colors.red('✗ No audio data recorded!'));
      console.error(colors.yellow('Possible issues:'));
      console.error(colors.yellow('  - Microphone not connected or not set as default'));
      console.error(colors.yellow('  - sox (macOS) or alsa-utils (Linux) not installed'));
      console.error(colors.yellow('  - Microphone permissions not granted'));
      console.error(colors.dim('\nCheck your system audio settings and microphone permissions.'));
      return null;
    }
    
    if (combinedBuffer.length < sampleRate) {
      console.log(colors.yellow(`⚠ Warning: Only recorded ${(combinedBuffer.length / sampleRate / 2).toFixed(2)}s - may not be enough for good match\n`));
    }
    
    // Save mic input if requested
    if (saveMicInput) {
      const timestamp = Date.now();
      const tempWavPath = `/tmp/mic_input_temp_${timestamp}.wav`;
      const mp3Path = `./mic_input_${timestamp}.mp3`;
      
      // First convert PCM to WAV (temporary)
      try {
        // Write PCM to temp file
        await Bun.write(tempWavPath.replace('.wav', '.pcm'), combinedBuffer);
        
        // Convert PCM to WAV
        await $`ffmpeg -f s16le -ar ${sampleRate} -ac 1 -i ${tempWavPath.replace('.wav', '.pcm')} -y ${tempWavPath}`.quiet();
        
        // Convert WAV to MP3
        await $`ffmpeg -i ${tempWavPath} -codec:a libmp3lame -qscale:a 2 -y ${mp3Path}`.quiet();
        
        console.log(colors.green(`✓ Saved microphone recording: ${mp3Path}`));
        console.log(colors.dim(`Test it with: bun index.js --detect --input ${mp3Path}\n`));
        
        // Clean up temp files
        await unlink(tempWavPath.replace('.wav', '.pcm'));
        await unlink(tempWavPath);
      } catch (err) {
        console.log(colors.red(`✗ Could not save recording: ${err.message}\n`));
      }
    }
    
    // Convert 16-bit PCM to Float32Array normalized to [-1, 1]
    const pcmData = new Int16Array(
      combinedBuffer.buffer,
      combinedBuffer.byteOffset,
      combinedBuffer.byteLength / 2
    );
    const audioBuffer = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      audioBuffer[i] = pcmData[i] / 32768.0;
    }
    
    const duration = audioBuffer.length / sampleRate;
    console.log(`Recorded ${duration.toFixed(2)} seconds`);
    
    const audioData = {
      audioBuffer,
      sampleRate,
    };
    
    const fingerprint = processAudioToFingerprint(audioData, {
      windowSize,
      overlap,
    });
    
    return fingerprint;
  } catch (error) {
    console.error('Error recording from microphone:', error);
    console.error('\nNote: Install mic package with: bun add mic');
    console.error('Also ensure sox (macOS/Windows) or alsa-utils (Linux) is installed');
    return null;
  }
}

function findBestMatch(inputFingerprint, database) {
  if (database.songs.length === 0) {
    return null;
  }
  
  console.log(`\n${colors.cyan('Input fingerprint:')} ${inputFingerprint.length} values`);
  console.log(`${colors.cyan('Matching against')} ${database.songs.length} songs in database...\n`);
  
  let allResults = [];
  
  // First pass: collect all scores
  for (const song of database.songs) {
    const result = matchFingerprint(inputFingerprint, song.frequencies);
    
    const strategy = inputFingerprint.length <= song.frequencies.length 
      ? 'slide-input' 
      : 'slide-window';
    
    allResults.push({ 
      song, 
      score: result.score,
      normalizedScore: result.normalizedScore,
      matchQuality: result.matchQuality,
      position: result.position,
      strategy 
    });
  }
  
  // Sort by normalized score (best first) - this is length-independent!
  allResults.sort((a, b) => a.normalizedScore - b.normalizedScore);
  
  // Find min and max normalized scores for confidence calculation
  const normalizedScores = allResults.map(s => s.normalizedScore);
  const minNormScore = Math.min(...normalizedScores);
  const maxNormScore = Math.max(...normalizedScores);
  const scoreRange = maxNormScore - minNormScore;
  
  // Calculate confidence and metrics for all results
  const resultsWithConfidence = allResults.map(item => {
    let confidence;
    if (scoreRange === 0) {
      confidence = 50;
    } else {
      // Confidence based on normalized score (length-independent)
      confidence = 100 * (1 - (item.normalizedScore - minNormScore) / scoreRange);
    }
    
    const compareLength = Math.min(inputFingerprint.length, item.song.frequencies.length);
    const avgDiff = (item.score / compareLength).toFixed(1);
    const matchQualityPercent = (item.matchQuality * 100).toFixed(1);
    
    return {
      song: item.song,
      score: item.score,
      normalizedScore: item.normalizedScore,
      position: item.position,
      confidence,
      avgDiff: parseFloat(avgDiff),
      matchQuality: parseFloat(matchQualityPercent),
      strategy: item.strategy,
    };
  });
  
  // Display all results with colors
  for (let i = 0; i < resultsWithConfidence.length; i++) {
    const item = resultsWithConfidence[i];
    
    // Color based on rank
    let nameColor = colors.gray;
    if (i === 0) nameColor = colors.green;
    else if (i === 1) nameColor = colors.yellow;
    else if (i === 2) nameColor = colors.blue;
    
    // Color confidence
    let confColor = colors.red;
    if (item.confidence >= 80) confColor = colors.green;
    else if (item.confidence >= 50) confColor = colors.yellow;
    
    // Color avg_diff
    let avgColor = colors.red;
    if (item.avgDiff < 5) avgColor = colors.green;
    else if (item.avgDiff < 15) avgColor = colors.yellow;
    
    // Color match quality
    let qualityColor = colors.red;
    if (item.matchQuality >= 50) qualityColor = colors.green;
    else if (item.matchQuality >= 30) qualityColor = colors.yellow;
    
    console.log(
      `${nameColor(item.song.name)} ` +
      `${colors.dim(`[${item.song.frequencies.length} values, ${item.strategy}]`)}: ` +
      `avg_diff=${avgColor(item.avgDiff.toFixed(1))}, ` +
      `quality=${qualityColor(item.matchQuality.toFixed(1) + '%')}, ` +
      `conf=${confColor(item.confidence.toFixed(1) + '%')}`
    );
  }
  
  return { bestMatch: resultsWithConfidence[0], allResults: resultsWithConfidence };
}

export async function runDetector() {
  const config = parseArgs();
  const useMic = hasFlag('--mic');
  
  console.log('Shazam Detector');
  console.log('===============');
  console.log(`Database: ${config.dbPath}`);
  console.log(`Window size: ${config.windowSize}ms`);
  console.log(`Overlap: ${(config.overlap * 100).toFixed(0)}%`);
  console.log(`Top results: ${config.topResults}`);
  console.log('');
  
  // Load database
  const database = await loadDatabase(config.dbPath);
  
  if (database.songs.length === 0) {
    console.error('Database is empty. Please run the parser first to add songs.');
    process.exit(1);
  }
  
  console.log(`Loaded database with ${database.songs.length} songs\n`);
  
  // Get input fingerprint
  let inputFingerprint = null;
  
  if (useMic) {
    if (config.saveMicInput) {
      console.log(colors.cyan('Microphone input will be saved for debugging\n'));
    }
    inputFingerprint = await recordFromMicrophone(config.windowSize, config.overlap, config.saveMicInput);
  } else {
    // Use custom input path if provided, otherwise search for input.* file
    let inputFile = config.inputPath;
    
    if (!inputFile) {
      inputFile = await findInputFile();
    }
    
    if (!inputFile) {
      console.error('No input file found. Expected a file named "input.*" with audio extension.');
      console.error('Supported formats: mp3, wav, flac, ogg, m4a, aac, wma');
      console.error('\nAlternatively, specify a file with --input PATH');
      console.error('Or use --mic flag to record from microphone.');
      process.exit(1);
    }
    
    // Check if file exists (for custom paths)
    if (!existsSync(inputFile)) {
      console.error(`Input file not found: ${inputFile}`);
      process.exit(1);
    }
    
    inputFingerprint = await processAudioFromFile(
      inputFile,
      config.windowSize,
      config.overlap
    );
  }
  
  if (!inputFingerprint || inputFingerprint.length === 0) {
    console.error('Failed to process input audio');
    process.exit(1);
  }
  
  // Find best match
  const result = findBestMatch(inputFingerprint, database);
  
  if (!result || !result.bestMatch) {
    console.error('\nNo matches found');
    process.exit(1);
  }
  
  const match = result.bestMatch;
  
  // Display main result with colors
  console.log('\n' + colors.bold(colors.cyan('═'.repeat(60))));
  console.log(colors.bold(colors.cyan('TOP MATCH')));
  console.log(colors.bold(colors.cyan('═'.repeat(60))));
  console.log(`${colors.bold('Song:')} ${colors.green(match.song.name)}`);
  // Color avg_diff based on quality
  let avgColor = colors.red;
  if (match.avgDiff < 5) avgColor = colors.green;
  else if (match.avgDiff < 15) avgColor = colors.yellow;
  console.log(`${colors.bold('Average Difference:')} ${avgColor(match.avgDiff.toFixed(1))} ${colors.dim('per value')}`);
  
  // Color match quality
  let qualityColor = colors.red;
  if (match.matchQuality >= 50) qualityColor = colors.green;
  else if (match.matchQuality >= 30) qualityColor = colors.yellow;
  console.log(`${colors.bold('Match Quality:')} ${qualityColor(match.matchQuality.toFixed(1) + '%')} ${colors.dim('of frames matched well')}`);
  
  console.log(`${colors.bold('Position:')} ${match.position} frames`);
  
  const strategyText = match.strategy === 'slide-input' 
    ? 'Input slid across song' 
    : 'Song compared to input windows';
  console.log(`${colors.bold('Strategy:')} ${strategyText}`);
  
  // Color confidence
  let confColor = colors.red;
  if (match.confidence >= 80) confColor = colors.green;
  else if (match.confidence >= 50) confColor = colors.yellow;
  console.log(`${colors.bold('Confidence:')} ${confColor(match.confidence.toFixed(1) + '%')} ${colors.dim('(relative to other songs)')}`);
  console.log(colors.cyan('═'.repeat(60)));
  
  // Show top results list only if topResults > 1
  if (config.topResults > 1 && result.allResults.length > 1) {
    const topN = Math.min(config.topResults, result.allResults.length);
    console.log('\n' + colors.bold(colors.yellow(`TOP ${topN} RESULTS`)));
    console.log(colors.yellow('─'.repeat(60)));
    
    for (let i = 0; i < topN; i++) {
      const item = result.allResults[i];
      
      // Number prefix with nerd font icons
      let prefix;
      if (i === 0) prefix = colors.yellow(`${i + 1}.  `);
      else if (i === 1) prefix = colors.gray(`${i + 1}.  `);
      else if (i === 2) prefix = colors.blue(`${i + 1}.  `);
      else prefix = colors.dim(`${i + 1}. `);
      
      // Color avg_diff
      let avgColor = colors.red;
      if (item.avgDiff < 5) avgColor = colors.green;
      else if (item.avgDiff < 15) avgColor = colors.yellow;
      
      // Color confidence
      let confColor = colors.red;
      if (item.confidence >= 80) confColor = colors.green;
      else if (item.confidence >= 50) confColor = colors.yellow;
      
      // Color match quality
      let qualityColor = colors.red;
      if (item.matchQuality >= 50) qualityColor = colors.green;
      else if (item.matchQuality >= 30) qualityColor = colors.yellow;
      
      console.log(
        `${prefix}${colors.bold(item.song.name)}\n` +
        `   ${colors.dim('avg_diff:')} ${avgColor(item.avgDiff.toFixed(1))} ${colors.dim('|')} ` +
        `${colors.dim('quality:')} ${qualityColor(item.matchQuality.toFixed(1) + '%')} ${colors.dim('|')} ` +
        `${colors.dim('conf:')} ${confColor(item.confidence.toFixed(1) + '%')}`
      );
    }
    console.log(colors.yellow('─'.repeat(60)));
  }
}

// Run directly if this file is executed
if (import.meta.path === Bun.main) {
  runDetector().catch(console.error);
}

