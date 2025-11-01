import Meyda from 'meyda';

/**
 * Step 1: Generate spectrogram from audio data
 */
function generateSpectrogram(audioBuffer, sampleRate, windowSize, overlap) {
  // Convert window size from ms to samples
  const windowSamples = Math.floor((windowSize / 1000) * sampleRate);
  const hopSize = Math.floor(windowSamples * (1 - overlap));
  
  const spectrogram = [];
  
  // Process audio in overlapping windows
  for (let i = 0; i + windowSamples <= audioBuffer.length; i += hopSize) {
    const frame = audioBuffer.slice(i, i + windowSamples);
    
    // Use Meyda to get power spectrum for this frame
    const features = Meyda.extract('powerSpectrum', frame, {
      sampleRate,
      bufferSize: windowSamples,
    });
    
    if (features && Array.isArray(features)) {
      spectrogram.push(features);
    }
  }
  
  return spectrogram;
}

/**
 * Step 2: Extract the strongest frequency from each frame
 * Returns frequency in Hz for each frame
 */
function extractPeaks(spectrogram, sampleRate) {
  const peaks = [];
  
  for (const frame of spectrogram) {
    // Find the bin with maximum power
    let maxPower = -Infinity;
    let maxBin = 0;
    
    for (let bin = 0; bin < frame.length; bin++) {
      if (frame[bin] > maxPower) {
        maxPower = frame[bin];
        maxBin = bin;
      }
    }
    
    // Convert bin index to frequency in Hz
    // Frequency resolution = sampleRate / (2 * number of bins)
    const frequencyResolution = sampleRate / (2 * frame.length);
    const frequency = maxBin * frequencyResolution;
    
    peaks.push(frequency);
  }
  
  return peaks;
}

/**
 * Step 3: Round all frequencies to nearest 10 Hz
 */
function roundToTenHz(frequencies) {
  return frequencies.map(freq => Math.round(freq / 10) * 10);
}

/**
 * Step 4: Remove consecutive duplicates
 */
function removeDuplicates(frequencies) {
  if (frequencies.length === 0) return [];
  
  const unique = [frequencies[0]];
  
  for (let i = 1; i < frequencies.length; i++) {
    if (frequencies[i] !== frequencies[i - 1]) {
      unique.push(frequencies[i]);
    }
  }
  
  return unique;
}

/**
 * Step 5: Replace notes with differences from previous note
 * Step 6: Remove the first note
 */
function convertToDifferences(frequencies) {
  if (frequencies.length < 2) return [];
  
  const differences = [];
  
  for (let i = 1; i < frequencies.length; i++) {
    differences.push(frequencies[i] - frequencies[i - 1]);
  }
  
  return differences;
}

/**
 * Step 7: Normalize by dividing by 10
 */
function normalizeFingerprint(differences) {
  return differences.map(diff => Math.round(diff / 10));
}

/**
 * Complete pipeline: Process audio to fingerprint
 */
export function processAudioToFingerprint(audioData, options) {
  console.log('Step 1: Generating spectrogram...');
  const spectrogram = generateSpectrogram(
    audioData.audioBuffer,
    audioData.sampleRate,
    options.windowSize,
    options.overlap
  );
  console.log(`Generated ${spectrogram.length} frames`);
  
  console.log('Step 2: Extracting peaks...');
  const peaks = extractPeaks(spectrogram, audioData.sampleRate);
  console.log(`Extracted ${peaks.length} peaks`);
  
  console.log('Step 3: Rounding to 10 Hz...');
  const rounded = roundToTenHz(peaks);
  
  console.log('Step 4: Removing duplicates...');
  const unique = removeDuplicates(rounded);
  console.log(`${unique.length} unique frequencies`);
  
  console.log('Step 5-6: Converting to differences...');
  const differences = convertToDifferences(unique);
  console.log(`${differences.length} differences`);
  
  console.log('Step 7: Normalizing...');
  const fingerprint = normalizeFingerprint(differences);
  console.log(`Final fingerprint: ${fingerprint.length} values`);
  
  return fingerprint;
}

/**
 * Match a fingerprint against a database fingerprint
 * Returns the minimum difference score and the position where it was found
 */
export function matchFingerprint(input, target) {
  if (input.length === 0 || target.length === 0) {
    return { score: Infinity, position: -1 };
  }
  
  let minScore = Infinity;
  let bestPosition = -1;
  
  // Slide input across target
  for (let offset = 0; offset <= target.length - input.length; offset++) {
    let score = 0;
    
    // Calculate sum of absolute differences at this position
    for (let i = 0; i < input.length; i++) {
      score += Math.abs(input[i] - target[offset + i]);
    }
    
    if (score < minScore) {
      minScore = score;
      bestPosition = offset;
    }
  }
  
  return { score: minScore, position: bestPosition };
}

