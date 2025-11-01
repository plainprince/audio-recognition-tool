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
bun run parser.js
```

The files will be moved to `audio_processed/` and fingerprints stored in `database.json`.

## Step 3: Test Detection

### Option A: From a file

Create a short clip or copy an audio file as `input.mp3`:

```bash
cp audio_processed/song1.mp3 input.mp3
```

Then detect:

```bash
bun run detector.js
```

### Option B: From microphone

First install the microphone package:

```bash
bun add @bun/mic
```

Then run:

```bash
bun run detector.js --mic
```

Press Enter when done recording.

## Advanced Options

### Custom window size and overlap

```bash
# Use 150ms windows with 60% overlap
bun run parser.js --window 150 --overlap 0.6

# Use same settings for detection
bun run detector.js --window 150 --overlap 0.6
```

### Custom paths

```bash
bun run parser.js --input-dir ./my_music --processed-dir ./processed --db-path ./my_db.json
```

## Tips

- Longer audio samples (5-10 seconds) generally work better for detection
- Make sure to use the same window/overlap settings for both parsing and detection
- The algorithm works best with clear, high-quality audio
- For noisy recordings, you may need to adjust the matching threshold (currently automatic)

