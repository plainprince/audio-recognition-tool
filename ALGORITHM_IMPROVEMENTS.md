# Algorithm Improvements for Live/Noisy Recordings

## Overview

The algorithm has been enhanced to handle real-world conditions better: microphone recordings, background noise, room acoustics, and speaker distortion.

## Key Improvements

### 1. Frequency Range Filtering (Step 2)

**What changed:**
- Now only considers frequencies between 300 Hz and 5000 Hz
- Ignores very low frequencies (< 300 Hz) - bass rumble, room noise
- Ignores very high frequencies (> 5000 Hz) - high-frequency noise, hiss

**Why it helps:**
- Most musical content (melody, vocals, distinctive instruments) is in this range
- Reduces impact of:
  - Room acoustics (low frequency reflections)
  - Speaker distortion (often in extreme ranges)
  - Environmental noise (traffic, air conditioning, etc.)
  - Microphone noise (typically high frequency hiss)

**Before:** Used full spectrum (0 - 22,050 Hz)  
**After:** Focus on 300 - 5000 Hz (musical range)

---

### 2. Adaptive Frequency Rounding (Step 3)

**What changed:**
- Frequencies < 2000 Hz: Round to 10 Hz (precise)
- Frequencies ≥ 2000 Hz: Round to 20 Hz (coarser)

**Why it helps:**
- Human hearing is more precise at lower frequencies
- High frequencies are less critical for song recognition
- Coarser rounding at high frequencies = more tolerance for:
  - Slight pitch shifts from speaker/mic quality
  - Room acoustics affecting high frequencies
  - Doppler effects from movement

**Before:** All frequencies rounded to 10 Hz  
**After:** Adaptive (10 Hz or 20 Hz depending on frequency)

---

### 3. Noise Spike Filtering (Step 4)

**What changed:**
- Frequencies must appear in at least 2 consecutive frames to be kept
- Single-frame "spikes" are now filtered out

**Why it helps:**
- Eliminates transient noise (clicks, pops, brief interference)
- Real musical content persists across multiple frames
- Reduces false patterns from:
  - Background conversations
  - Door slams, dishes clinking
  - Brief electronic interference
  - Microphone handling noise

**Before:** Kept all unique frequencies (including noise spikes)  
**After:** Only keeps frequencies that persist (≥ 2 frames)

---

### 4. Pattern-Aware Matching (Step 7)

**What changed:**
- Rewards consecutive good matches (patterns)
- Close matches (diff ≤ 2) get 50% reduced penalty
- Sequences of 5+ good matches get bonus points

**Why it helps:**
- Musical patterns are more important than individual notes
- A sequence that "flows" correctly is more significant
- Tolerates occasional mismatches if overall pattern is right
- Better handles:
  - Brief dropout or interference
  - Slight tempo variations
  - Individual frequency errors if pattern is correct

**Scoring example:**
```
Before: All differences weighted equally
  [1, 1, 10, 1, 1] → score = 14

After: Pattern-aware scoring
  [1, 1, 10, 1, 1] → score ≈ 11.8
  (consecutive 1's get reduced weight + bonus)
```

---

## Impact on Detection

### Expected Improvements

1. **Better noise tolerance**
   - Background conversations less disruptive
   - Room echo has less impact
   - Environmental sounds filtered out

2. **Speaker quality independence**
   - Works better with phone/laptop speakers
   - Less affected by speaker distortion
   - Handles different acoustic environments

3. **More robust matching**
   - Pattern recognition over exact matches
   - Tolerates brief interruptions
   - Better handles slight timing variations

### Trade-offs

**Slightly shorter fingerprints:**
- Noise filtering removes some data points
- This is good - removes noise, keeps signal
- May be 10-20% shorter fingerprints

**Different score ranges:**
- Scores may be lower due to weighted matching
- avg_diff interpretation stays similar:
  - < 3: Excellent match
  - 3-8: Good match
  - 8-15: Possible match
  - > 15: Poor match

---

## When to Re-index Database

**You should re-parse your songs** to get full benefit:

```bash
# Move all songs back to input
mv audio_processed/*.mp3 audio_input/

# Clear database
echo '{"songs":[]}' > database.json

# Re-parse with improved algorithm
bun index.js --parse
```

**Why re-index?**
- Database songs will use new frequency range (300-5000 Hz)
- Will use new noise filtering (≥ 2 frame persistence)
- Will use adaptive rounding
- Ensures consistency between database and live recordings

**Can you skip re-indexing?**
- Yes, but matches may be slightly less accurate
- Old fingerprints used full spectrum
- New recordings use filtered spectrum
- They'll still match, just not optimally

---

## Testing the Improvements

### 1. Test with clean file first
```bash
# Should still match perfectly or very close
bun index.js --detect --input audio_processed/The_Weeknd_-_Blinding_Lights.mp3 --top 1
# Expected: avg_diff < 2
```

### 2. Test with microphone
```bash
# Play song through speakers, record with mic
bun index.js --detect --mic --save-mic --top 5
# Expected: avg_diff 3-8 (vs 15+ before)
```

### 3. Test with saved mic recording
```bash
# Test the saved file directly
bun index.js --detect --input mic_input_xxx.mp3 --top 5
# Should be similar to live mic test
```

---

## Advanced: Fine-tuning

If results still aren't great, you can adjust these values:

### Frequency Range (in `algorithm.js`, line ~58)
```javascript
const minFreq = 300;  // Lower = include more bass
const maxFreq = 5000; // Higher = include more highs
```

Try:
- **More noise?** Narrow range: 400-4000 Hz
- **Quiet recording?** Widen range: 200-6000 Hz

### Noise Filtering (line ~123)
```javascript
if (count >= 2) {  // Increase for more aggressive filtering
```

Try:
- **Lots of noise?** Require 3 frames: `count >= 3`
- **Missing some matches?** Reduce to 1: `count >= 1`

### Pattern Matching (line ~224)
```javascript
if (diff <= 2) {  // Tolerance for "good match"
```

Try:
- **Too loose?** Stricter: `diff <= 1`
- **Too strict?** Looser: `diff <= 3`

---

## Summary

These purely algorithmic improvements make the system much more robust for real-world use without any AI or complex signal processing. The key insight: **focus on what matters (musical patterns in relevant frequency ranges) and ignore what doesn't (noise, extremes, spikes)**.


