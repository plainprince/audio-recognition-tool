import { readdir, rename } from 'node:fs/promises';
import { join, basename } from 'node:path';
import decode from 'audio-decode';
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
  try {
    console.log(`\nProcessing: ${basename(filePath)}`);
    
    // Load audio file using audio-decode
    const file = Bun.file(filePath);
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await decode(arrayBuffer);
    
    // audio-decode returns AudioBuffer with channelData
    // We'll use the first channel (mono or left channel)
    const channelData = audioBuffer.getChannelData(0);
    
    const audioData = {
      audioBuffer: channelData,
      sampleRate: audioBuffer.sampleRate,
    };
    
    console.log(`Sample rate: ${audioBuffer.sampleRate} Hz`);
    console.log(`Duration: ${audioBuffer.duration.toFixed(2)} seconds`);
    
    // Process through algorithm
    const fingerprint = processAudioToFingerprint(audioData, {
      windowSize,
      overlap,
    });
    
    return fingerprint;
  } catch (error) {
    console.error(`Error processing ${basename(filePath)}:`, error);
    return null;
  }
}

async function main() {
  const config = parseArgs();
  
  console.log('Shazam Parser');
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

main().catch(console.error);

