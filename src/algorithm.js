import Meyda from 'meyda';

/**
 * Round to nearest power of 2 (required by Meyda)
 */
function nearestPowerOf2(n) {
  return Math.pow(2, Math.round(Math.log2(n)));
}

/**
 * Step 1: Generate spectrogram from audio data
 */
function generateSpectrogram(audioBuffer, sampleRate, windowSize, overlap) {
  // Convert window size from ms to samples
  const requestedSamples = Math.floor((windowSize / 1000) * sampleRate);
  
  // Meyda requires buffer size to be a power of 2
  const windowSamples = nearestPowerOf2(requestedSamples);
  const hopSize = Math.floor(windowSamples * (1 - overlap));
  
  const spectrogram = [];
  
  // Process audio in overlapping windows
  for (let i = 0; i + windowSamples <= audioBuffer.length; i += hopSize) {
    const frame = audioBuffer.slice(i, i + windowSamples);
    
    try {
      // Use Meyda to get power spectrum for this frame
      const features = Meyda.extract('powerSpectrum', frame, {
        sampleRate,
        bufferSize: windowSamples,
      });
      
      if (features) {
        spectrogram.push(features);
      }
    } catch (error) {
      console.error(`  Meyda error at frame ${i}:`, error.message);
      break;
    }
  }
  
  return spectrogram;
}

/**
 * Step 2: Extract the strongest frequency from each frame
 * Returns frequency in Hz for each frame
 * 
 * Enhanced: Ignores very low frequencies (< 300 Hz) and very high (> 5000 Hz)
 * to focus on the main melodic/vocal range and reduce noise
 */
function extractPeaks(spectrogram, sampleRate) {
  const peaks = [];
  const frequencyResolution = sampleRate / (2 * spectrogram[0].length);
  
  // Focus on human hearing range where music is most distinct
  const minFreq = 300;  // Hz - ignore bass rumble and noise
  const maxFreq = 5000; // Hz - ignore high frequency noise
  
  const minBin = Math.floor(minFreq / frequencyResolution);
  const maxBin = Math.min(
    Math.floor(maxFreq / frequencyResolution),
    spectrogram[0].length - 1
  );
  
  for (const frame of spectrogram) {
    // Find the bin with maximum power in the useful frequency range
    let maxPower = -Infinity;
    let maxBin_found = minBin;
    
    for (let bin = minBin; bin <= maxBin; bin++) {
      if (frame[bin] > maxPower) {
        maxPower = frame[bin];
        maxBin_found = bin;
      }
    }
    
    const frequency = maxBin_found * frequencyResolution;
    peaks.push(frequency);
  }
  
  return peaks;
}

/**
 * Step 3: Round all frequencies to nearest 10 Hz
 * 
 * Enhanced: Uses adaptive rounding - less precision at higher frequencies
 * where human perception is less precise
 */
function roundToTenHz(frequencies) {
  return frequencies.map(freq => {
    // Standard rounding for most frequencies
    if (freq < 2000) {
      return Math.round(freq / 10) * 10;
    }
    // Coarser rounding for high frequencies (less critical for recognition)
    else {
      return Math.round(freq / 20) * 20;
    }
  });
}

/**
 * Step 4: Remove consecutive duplicates
 * 
 * Enhanced: Also removes short-lived frequency spikes (noise)
 * A frequency must appear for at least 2 consecutive frames to be kept
 */
function removeDuplicates(frequencies) {
  if (frequencies.length === 0) return [];
  
  const unique = [];
  let currentFreq = frequencies[0];
  let count = 1;
  
  for (let i = 1; i < frequencies.length; i++) {
    if (frequencies[i] === currentFreq) {
      count++;
    } else {
      // Only keep frequencies that appeared multiple times (reduces noise)
      if (count >= 2) {
        unique.push(currentFreq);
      }
      currentFreq = frequencies[i];
      count = 1;
    }
  }
  
  // Don't forget the last frequency
  if (count >= 2) {
    unique.push(currentFreq);
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
 * Calculate match score for a specific alignment
 * Uses pattern-aware scoring
 */
function calculateAlignmentScore(arr1, arr2, offset1, offset2, compareLength) {
  let rawScore = 0;
  let consecutiveMatches = 0;
  let totalMatches = 0;
  
  for (let i = 0; i < compareLength; i++) {
    const diff = Math.abs(arr1[offset1 + i] - arr2[offset2 + i]);
    
    // Good match (difference <= 2)
    if (diff <= 2) {
      consecutiveMatches++;
      totalMatches++;
      // Reward consecutive matches (patterns are important)
      rawScore += diff * 0.5;
    } else {
      // Reset consecutive counter
      consecutiveMatches = 0;
      rawScore += diff;
    }
    
    // Bonus for long sequences of good matches
    if (consecutiveMatches >= 5) {
      rawScore -= consecutiveMatches * 0.1;
    }
  }
  
  // Calculate match quality (0-1, higher is better)
  const matchQuality = totalMatches / compareLength;
  
  return { rawScore, matchQuality };
}

/**
 * Match a fingerprint against a database fingerprint
 * Returns normalized score, position, and match statistics
 * 
 * New approach: Length-normalized scoring
 * - Uses average difference per frame (not total)
 * - Considers match quality (percentage of good matches)
 * - Final score = avgDiff * (2 - matchQuality)
 *   This penalizes songs with few good matches even if avgDiff is low
 */
export function matchFingerprint(input, target) {
  if (input.length === 0 || target.length === 0) {
    return { score: Infinity, position: -1, matchQuality: 0 };
  }
  
  let bestScore = Infinity;
  let bestPosition = -1;
  let bestMatchQuality = 0;
  let bestRawScore = Infinity;
  
  if (input.length <= target.length) {
    // Case 1: Input is shorter - slide input across target
    const compareLength = input.length;
    
    // Only check every Nth position for speed (step size based on length)
    const stepSize = Math.max(1, Math.floor(compareLength / 20));
    
    for (let offset = 0; offset <= target.length - compareLength; offset += stepSize) {
      const { rawScore, matchQuality } = calculateAlignmentScore(
        input, target, 0, offset, compareLength
      );
      
      // Normalize by length and weight by match quality
      const avgDiff = rawScore / compareLength;
      const normalizedScore = avgDiff * (2 - matchQuality);
      
      if (normalizedScore < bestScore) {
        bestScore = normalizedScore;
        bestPosition = offset;
        bestMatchQuality = matchQuality;
        bestRawScore = rawScore;
      }
    }
    
    // Refine around best position (check positions we skipped)
    if (stepSize > 1) {
      const refineStart = Math.max(0, bestPosition - stepSize);
      const refineEnd = Math.min(target.length - compareLength, bestPosition + stepSize);
      
      for (let offset = refineStart; offset <= refineEnd; offset++) {
        const { rawScore, matchQuality } = calculateAlignmentScore(
          input, target, 0, offset, compareLength
        );
        
        const avgDiff = rawScore / compareLength;
        const normalizedScore = avgDiff * (2 - matchQuality);
        
        if (normalizedScore < bestScore) {
          bestScore = normalizedScore;
          bestPosition = offset;
          bestMatchQuality = matchQuality;
          bestRawScore = rawScore;
        }
      }
    }
  } else {
    // Case 2: Input is longer - slide target-sized windows across input
    const compareLength = target.length;
    const stepSize = Math.max(1, Math.floor(compareLength / 20));
    
    for (let offset = 0; offset <= input.length - compareLength; offset += stepSize) {
      const { rawScore, matchQuality } = calculateAlignmentScore(
        input, target, offset, 0, compareLength
      );
      
      const avgDiff = rawScore / compareLength;
      const normalizedScore = avgDiff * (2 - matchQuality);
      
      if (normalizedScore < bestScore) {
        bestScore = normalizedScore;
        bestPosition = offset;
        bestMatchQuality = matchQuality;
        bestRawScore = rawScore;
      }
    }
    
    // Refine around best position
    if (stepSize > 1) {
      const refineStart = Math.max(0, bestPosition - stepSize);
      const refineEnd = Math.min(input.length - compareLength, bestPosition + stepSize);
      
      for (let offset = refineStart; offset <= refineEnd; offset++) {
        const { rawScore, matchQuality } = calculateAlignmentScore(
          input, target, offset, 0, compareLength
        );
        
        const avgDiff = rawScore / compareLength;
        const normalizedScore = avgDiff * (2 - matchQuality);
        
        if (normalizedScore < bestScore) {
          bestScore = normalizedScore;
          bestPosition = offset;
          bestMatchQuality = matchQuality;
          bestRawScore = rawScore;
        }
      }
    }
  }
  
  // Return legacy format + new metrics
  return { 
    score: bestRawScore,
    position: bestPosition,
    matchQuality: bestMatchQuality,
    normalizedScore: bestScore
  };
}

