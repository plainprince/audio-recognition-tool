# Shazam Algorithm Implementation

## Overview

This implementation follows a 7-step process to create audio fingerprints that can be efficiently matched.

## Processing Steps

### 1. Generate Spectrogram
- Uses Meyda to generate power spectrum for overlapping audio frames
- Default: 100ms windows with 50% overlap
- Window size automatically rounded to nearest power of 2 (required by Meyda)
- At 44.1kHz: 100ms → 4096 samples (92.9ms)

### 2. Extract Peak Frequencies
- Takes the **strongest frequency** from each frame
- Only 1 peak per frame for maximum compression
- Converts frequency bin index to Hz

### 3. Round to 10 Hz
- Reduces precision to make matching more robust
- Helps tolerate minor variations in recording quality

### 4. Remove Consecutive Duplicates
- Eliminates repeated frequencies in sequence
- Creates the "flow" of the music

### 5-6. Convert to Differences
- Replaces each frequency with its difference from the previous one
- Removes the first value (no previous to compare)
- Makes fingerprint independent of absolute pitch

### 7. Normalize
- Divides all differences by 10
- Final compact representation stored in database

## Matching Algorithm

The matching algorithm handles two scenarios intelligently:

### Case 1: Input Shorter Than Song (Most Common)
**Example:** 10-second clip vs 3-minute song

```
Strategy: Slide input across song
Input:  [----5s----]
Song:   [----------------3min----------------]
        ^try here
         ^and here
          ^and here... (every position)
```

- Tries **every possible position** in the song
- Finds where the input best matches
- Returns: position in song where match occurred

### Case 2: Input Longer Than Song
**Example:** 5-minute recording vs 3-minute song

```
Strategy: Slide song-sized windows across input
Input:  [----------------5min----------------]
         [---3min---]
          [---3min---]
           [---3min---]... (every position)
Song:    [---3min---]
```

- Tries **every possible window** of song-length from input
- Temporarily "cuts" input to song length at each position
- Original input never permanently modified
- Returns: position in input where match occurred

### Scoring

- **Score**: Sum of absolute differences at each position
- **Lower score = better match**
- **Average Difference**: Score divided by comparison length (easier to interpret)
- **Position**: Frame offset where best match was found
- **Confidence**: Relative confidence compared to other songs in database
  - 100% = Best match among all songs
  - 0% = Worst match among all songs
  - Calculated as: `100% × (1 - (score - minScore) / scoreRange)`
  - Note: Confidence is relative, not absolute. 100% means "best in database", not "perfect match"

Algorithm tests all possible positions, guaranteed to find the best match.

## Performance

- Fast enough to try every position (no need for optimization)
- Typical speeds:
  - 10s input vs 100 songs: < 1 second
  - Full song matching: < 5 seconds
- Fingerprints are highly compressed (3000-5000 values for 3-minute song)

## Example Output

```
Input fingerprint: 1200 values (10 second clip)
Matching against 100 songs in database...

Song_A.mp3 [3647 values, slide-input]: score=15420, avg_diff=12.9, confidence=45.2%
Song_B.mp3 [4201 values, slide-input]: score=4532, avg_diff=3.8, confidence=100.0%
Song_C.mp3 [2890 values, slide-input]: score=28901, avg_diff=24.1, confidence=0.0%

RESULT:
Song: Song_B.mp3
Match Score: 4532 (total difference)
Average Difference: 3.8 per value
Position: 1203 frames
Strategy: Input slid across song
Confidence: 100.0% (relative to other songs)
```

### Interpreting Results

- **Score**: Raw sum of differences - useful for debugging
- **Average Difference**: More meaningful metric
  - ~0-5: Excellent match (likely correct)
  - ~5-15: Good match (probably correct)
  - ~15-30: Poor match (possibly wrong genre)
  - >30: Very poor match (likely incorrect)
- **Confidence**: How much better this match is compared to others
  - High confidence + low avg_diff = very likely correct
  - High confidence + high avg_diff = best of bad options
  - Low confidence = similar to other songs (ambiguous)

## Robustness

The algorithm is robust against:
- Background noise (takes only strongest frequency)
- Recording quality variations (10 Hz rounding)
- Pitch variations (using differences, not absolute frequencies)
- Different recording lengths (sliding window approach)

## Technical Details

### Audio Processing
- Uses ffmpeg to convert any format to WAV
- Resamples to 44.1kHz mono
- Parses WAV manually for reliability
- Converts 16-bit PCM to normalized float32

### Database Format
```json
{
  "songs": [
    {
      "name": "song.mp3",
      "id": "timestamp_hash",
      "frequencies": [120, -50, 30, -15, ...]
    }
  ]
}
```

Each value in `frequencies` is a normalized frequency difference (÷10).

