import { readdir, rename, unlink } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { $ } from 'bun';
import { processAudioToFingerprint } from './algorithm.js';
import { parseArgs } from './config.js';
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

async function saveDatabase(dbPath, database) {
  await Bun.write(dbPath, JSON.stringify(database, null, 2));
}

function generateId() {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

async function processAudioFile(filePath, windowSize, overlap) {
  const tempWavPath = `/tmp/shazam_temp_${Date.now()}.wav`;
  
  try {
    console.log(`\nProcessing: ${basename(filePath)}`);
    
    // Convert to WAV using ffmpeg for reliable decoding
    await $`ffmpeg -i ${filePath} -ar 44100 -ac 1 -y ${tempWavPath}`.quiet();
    
    // Read WAV file manually (simple WAV parser)
    const wavFile = Bun.file(tempWavPath);
    const wavBuffer = await wavFile.arrayBuffer();
    const view = new DataView(wavBuffer);
    
    // Parse WAV header
    // Skip RIFF header (12 bytes), find "fmt " chunk
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
        // Found format chunk
        const sampleRate = view.getUint32(offset + 12, true);
        offset += 8 + chunkSize;
        
        // Find data chunk
        while (offset < view.byteLength - 8) {
          const dataChunkId = String.fromCharCode(
            view.getUint8(offset),
            view.getUint8(offset + 1),
            view.getUint8(offset + 2),
            view.getUint8(offset + 3)
          );
          const dataChunkSize = view.getUint32(offset + 4, true);
          
          if (dataChunkId === 'data') {
            // Found data chunk - read PCM data
            const pcmData = new Int16Array(wavBuffer, offset + 8, dataChunkSize / 2);
            
            // Convert to Float32Array normalized to [-1, 1]
            const channelData = new Float32Array(pcmData.length);
            for (let i = 0; i < pcmData.length; i++) {
              channelData[i] = pcmData[i] / 32768.0;
            }
            
            const duration = channelData.length / sampleRate;
            
            console.log(`Sample rate: ${sampleRate} Hz`);
            console.log(`Duration: ${duration.toFixed(2)} seconds`);
            
            const audioData = {
              audioBuffer: channelData,
              sampleRate: sampleRate,
            };
            
            // Process through algorithm
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
    console.error(`Error processing ${basename(filePath)}:`, error.message || error);
    return null;
  } finally {
    // Clean up temp WAV file
    try {
      if (existsSync(tempWavPath)) {
        await unlink(tempWavPath);
      }
    } catch {}
  }
}

export async function runParser() {
  const config = parseArgs();
  
  console.log('Audio Parser');
  console.log('=============');
  console.log(`Input directory: ${config.inputDir}`);
  console.log(`Processed directory: ${config.processedDir}`);
  console.log(`Database: ${config.dbPath}`);
  console.log(`Window size: ${config.windowSize}ms`);
  console.log(`Overlap: ${(config.overlap * 100).toFixed(0)}%`);
  console.log('');
  
  // Check if input directory exists
  if (!existsSync(config.inputDir)) {
    console.error(`Input directory does not exist: ${config.inputDir}`);
    process.exit(1);
  }
  
  // Ensure processed directory exists
  if (!existsSync(config.processedDir)) {
    await Bun.write(join(config.processedDir, '.gitkeep'), '');
  }
  
  // Load existing database
  const database = await loadDatabase(config.dbPath);
  console.log(`Loaded database with ${database.songs.length} existing songs\n`);
  
  // Get all audio files from input directory
  const files = await readdir(config.inputDir);
  const audioFiles = files.filter(file => {
    const ext = file.toLowerCase().split('.').pop();
    return ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'wma'].includes(ext || '');
  });
  
  if (audioFiles.length === 0) {
    console.log('No audio files found in input directory.');
    return;
  }
  
  console.log(`Found ${audioFiles.length} audio files to process\n`);
  
  let processed = 0;
  let failed = 0;
  
  // Process each file
  for (const file of audioFiles) {
    const filePath = join(config.inputDir, file);
    
    const fingerprint = await processAudioFile(
      filePath,
      config.windowSize,
      config.overlap
    );
    
    if (fingerprint && fingerprint.length > 0) {
      // Add to database
      const song = {
        name: file,
        id: generateId(),
        frequencies: fingerprint,
      };
      
      database.songs.push(song);
      
      // Move file to processed directory
      const destPath = join(config.processedDir, file);
      await rename(filePath, destPath);
      
      console.log(`Success! Added to database with ID: ${song.id}`);
      console.log(`Moved to: ${config.processedDir}/`);
      processed++;
    } else {
      console.error(`Failed to process ${file}`);
      failed++;
    }
  }
  
  // Save updated database
  await saveDatabase(config.dbPath, database);
  
  console.log('\n=============');
  console.log('Summary:');
  console.log(`Processed: ${processed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total songs in database: ${database.songs.length}`);
}

// Run directly if this file is executed
if (import.meta.path === Bun.main) {
  runParser().catch(console.error);
}

