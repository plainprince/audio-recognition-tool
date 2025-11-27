# Shazam Clone

A Shazam-like audio fingerprinting and recognition system built with Bun, Meyda, and audio-decode.

## Installation

```bash
bun install
```

**Required:** Install ffmpeg for audio decoding:
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg
```

**Optional:** For microphone support, install recording dependencies:
```bash
# Install the mic package
bun add mic

# macOS/Windows - Install sox
brew install sox  # macOS
# Windows - sox will auto-download

# Linux - Install alsa-utils
sudo apt-get install alsa-utils  # Debian/Ubuntu
sudo dnf install alsa-utils       # RedHat/Fedora
```

## How It Works

The algorithm follows these steps:

1. Generate a spectrogram from the audio
2. Extract the strongest frequency from each frame
3. Round all frequencies to the nearest 10 Hz
4. Remove consecutive duplicates
5. Convert to differences between consecutive frequencies
6. Remove the first frequency
7. Normalize by dividing by 10

This creates a compact "fingerprint" that can be matched against a database.

## Usage

### Parser - Index Audio Files

Place audio files in the `audio_input/` directory, then run:

```bash
bun run parse
# or
bun index.js --parse
```

This will:
- Process all audio files in `audio_input/`
- Generate fingerprints using the Shazam algorithm
- Store them in `database.json`
- Move processed files to `audio_processed/`

**Supported formats**: mp3, wav, flac, ogg, m4a, aac, wma

**Options**:
- `--window MS` - Window size in milliseconds (default: 100)
- `--overlap 0-1` - Overlap ratio (default: 0.5)
- `--input-dir PATH` - Custom input directory
- `--processed-dir PATH` - Custom processed directory
- `--db-path PATH` - Custom database path

Example:
```bash
bun index.js --parse --window 150 --overlap 0.6
```

### Detector - Identify Songs

#### From File

**Option 1:** Place an audio file named `input.*` (e.g., `input.mp3`) in the project root:

```bash
bun run detect
# or
bun index.js --detect
```

**Option 2:** Specify a custom file path:

```bash
bun index.js --detect --input /path/to/your/song.mp3
# or relative path
bun index.js --detect --input ./my_audio/song.mp3
```

#### From Microphone

```bash
bun run detect:mic
# or
bun index.js --detect --mic
```

Press Enter to stop recording and start matching.

**Options**:
- `--mic` - Use microphone input instead of file
- `--input PATH` - Specify input file path (relative to current directory)
- `--top N` - Show top N results (default: 5, set to 1 to hide list)
- `--window MS` - Window size in milliseconds (default: 100)
- `--overlap 0-1` - Overlap ratio (default: 0.5)
- `--db-path PATH` - Custom database path

**Examples**:
```bash
# Show only the best match
bun index.js --detect --top 1

# Show top 10 results
bun index.js --detect --top 10

# Default (top 5)
bun index.js --detect
```

## Database Format

The database is stored in `database.json`:

```json
{
  "songs": [
    {
      "name": "song_name.mp3",
      "id": "unique_id_123",
      "frequencies": [120, -50, 30, ...]
    }
  ]
}
```

The `frequencies` array contains the normalized frequency differences that serve as the song's fingerprint.

## Matching Algorithm

The detector:
1. Processes the input audio through the same algorithm
2. Slides the input fingerprint across each song's fingerprint
3. Calculates the sum of absolute differences at each position
4. Finds the minimum score for each song
5. Returns the song with the lowest overall score

Lower score = better match.

## Performance

The current implementation should handle databases of ~500-1000 songs efficiently. For larger databases, optimization strategies include:
- Indexing fingerprints by common patterns
- Early termination when score exceeds threshold
- Parallel processing of database matches
- Hash-based lookups for initial filtering

## Project Structure

```
shazam/
├── index.js           # Main entry point with --parse/--detect flags
├── src/
│   ├── algorithm.js   # Core Shazam algorithm
│   ├── config.js      # Configuration management
│   ├── parser.js      # Audio file indexer
│   └── detector.js    # Song detector
├── download_songs.js  # YouTube downloader script
├── database.json      # Fingerprint database
├── audio_input/       # Place audio files here
└── audio_processed/   # Processed files moved here
```

