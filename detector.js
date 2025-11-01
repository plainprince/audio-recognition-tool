import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import decode from 'audio-decode';
import { processAudioToFingerprint, matchFingerprint } from './algorithm.js';
import { parseArgs, hasFlag } from './config.js';
import { existsSync } from 'node:fs';

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
  try {
    console.log(`Loading: ${filePath}\n`);
    
    const file = Bun.file(filePath);
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await decode(arrayBuffer);
    
    const channelData = audioBuffer.getChannelData(0);
    
    const audioData = {
      audioBuffer: channelData,
      sampleRate: audioBuffer.sampleRate,
    };
    
    console.log(`Sample rate: ${audioBuffer.sampleRate} Hz`);
    console.log(`Duration: ${audioBuffer.duration.toFixed(2)} seconds\n`);
    
    const fingerprint = processAudioToFingerprint(audioData, {
      windowSize,
      overlap,
    });
    
    return fingerprint;
  } catch (error) {
    console.error('Error processing audio file:', error);
    return null;
  }
}

async function recordFromMicrophone(windowSize, overlap) {
  console.log('Microphone mode - Recording...');
  console.log('Press Enter to stop recording\n');
  
  try {
    // Dynamic import of @bun/mic since it might not be installed yet
    const { default: mic } = await import('@bun/mic');
    
    const chunks = [];
    let sampleRate = 48000; // Default, will be updated
    
    const recorder = mic({
      channels: 1,
      sampleRate: 48000,
    });
    
    recorder.ondata = (chunk) => {
      chunks.push(new Float32Array(chunk));
    };
    
    recorder.start();
    
    // Wait for Enter key press
    process.stdin.setRawMode(true);
    process.stdin.resume();
    
    await new Promise((resolve) => {
      process.stdin.on('data', (key) => {
        // Check for Enter key (code 13 or 10)
        if (key[0] === 13 || key[0] === 10) {
          resolve();
        }
        // Check for Ctrl+C
        if (key[0] === 3) {
          process.exit(0);
        }
      });
    });
    
    recorder.stop();
    process.stdin.setRawMode(false);
    process.stdin.pause();
    
    console.log('\nRecording stopped. Processing...\n');
    
    // Combine all chunks into a single buffer
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combinedBuffer = new Float32Array(totalLength);
    let offset = 0;
    
    for (const chunk of chunks) {
      combinedBuffer.set(chunk, offset);
      offset += chunk.length;
    }
    
    if (combinedBuffer.length === 0) {
      console.error('No audio data recorded');
      return null;
    }
    
    const audioData = {
      audioBuffer: combinedBuffer,
      sampleRate,
    };
    
    console.log(`Recorded ${(combinedBuffer.length / sampleRate).toFixed(2)} seconds`);
    
    const fingerprint = processAudioToFingerprint(audioData, {
      windowSize,
      overlap,
    });
    
    return fingerprint;
  } catch (error) {
    console.error('Error recording from microphone:', error);
    console.error('\nNote: Install @bun/mic with: bun add @bun/mic');
    return null;
  }
}

function findBestMatch(inputFingerprint, database) {
  if (database.songs.length === 0) {
    return null;
  }
  
  console.log(`\nMatching against ${database.songs.length} songs in database...\n`);
  
  let bestMatch = null;
  
  for (const song of database.songs) {
    const { score, position } = matchFingerprint(inputFingerprint, song.frequencies);
    
    // Calculate confidence (inverse of score, normalized)
    // Lower score = better match = higher confidence
    const confidence = score === 0 ? 100 : Math.max(0, 100 - score);
    
    console.log(`${song.name}: score=${score}, position=${position}, confidence=${confidence.toFixed(1)}%`);
    
    if (!bestMatch || score < bestMatch.score) {
      bestMatch = {
        song,
        score,
        position,
        confidence,
      };
    }
  }
  
  return bestMatch;
}

async function main() {
  const config = parseArgs();
  const useMic = hasFlag('--mic');
  
  console.log('Shazam Detector');
  console.log('===============');
  console.log(`Database: ${config.dbPath}`);
  console.log(`Window size: ${config.windowSize}ms`);
  console.log(`Overlap: ${(config.overlap * 100).toFixed(0)}%`);
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
    inputFingerprint = await recordFromMicrophone(config.windowSize, config.overlap);
  } else {
    const inputFile = await findInputFile();
    
    if (!inputFile) {
      console.error('No input file found. Expected a file named "input.*" with audio extension.');
      console.error('Supported formats: mp3, wav, flac, ogg, m4a, aac, wma');
      console.error('\nOr use --mic flag to record from microphone.');
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
  const match = findBestMatch(inputFingerprint, database);
  
  if (!match) {
    console.error('\nNo matches found');
    process.exit(1);
  }
  
  // Display result
  console.log('\n===============');
  console.log('RESULT:');
  console.log(`Song: ${match.song.name}`);
  console.log(`Score: ${match.score} (lower is better)`);
  console.log(`Position: ${match.position} frames into the song`);
  console.log(`Confidence: ${match.confidence.toFixed(1)}%`);
  console.log('===============');
}

main().catch(console.error);

