# Quick Start Guide

## Step 1: Add Audio Files

Place audio files you want to index in the `audio_input/` folder:

```bash
cp ~/Music/song1.mp3 audio_input/
cp ~/Music/song2.mp3 audio_input/
```

## Step 2: Index the Files

Run the parser to process and index them:

```bash
bun run parse
```

The files will be moved to `audio_processed/` and fingerprints stored in `database.json`.

## Step 3: Test Detection

### Option A: From a file

**Method 1:** Create a short clip or copy an audio file as `input.mp3`:

```bash
cp audio_processed/song1.mp3 input.mp3
bun run detect
```

**Method 2:** Specify any file path directly:

```bash
bun index.js --detect --input audio_processed/song1.mp3
# or from anywhere
bun index.js --detect --input ~/Music/mysong.mp3
```

### Option B: From microphone

First install the microphone package and dependencies:

```bash
# Install mic package
bun add mic

# Install system dependencies
brew install sox  # macOS
# or
sudo apt-get install alsa-utils  # Linux
```

Then run:

```bash
bun run detect:mic
```

Press Enter when done recording.

## Advanced Options

### Custom window size and overlap

```bash
# Use 150ms windows with 60% overlap
bun index.js --parse --window 150 --overlap 0.6

# Use same settings for detection
bun index.js --detect --window 150 --overlap 0.6
```

### Custom paths

```bash
bun index.js --parse --input-dir ./my_music --processed-dir ./processed --db-path ./my_db.json
```

## Tips

- Longer audio samples (5-10 seconds) generally work better for detection
- Make sure to use the same window/overlap settings for both parsing and detection
- The algorithm works best with clear, high-quality audio
- For noisy recordings, you may need to adjust the matching threshold (currently automatic)

