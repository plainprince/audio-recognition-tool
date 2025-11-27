# Debugging Shazam Detection

## Problem: Microphone Detection Not Working

If microphone detection is giving wrong results (like matching "Blinding Lights" to "Back to Black"), follow these debugging steps:

### Step 1: Save Microphone Input

Use the `--save-mic` flag to save what the microphone is actually recording:

```bash
bun index.js --detect --mic --save-mic --top 30
```

This will:
1. Record from microphone as usual
2. Save the recording as `mic_input_[timestamp].mp3`
3. Show you the command to test the saved file
4. Show diagnostic info (number of chunks, total bytes recorded)

### Step 2: Test the Saved Recording

After saving, test detection with the saved file:

```bash
# The command will be shown in the output, like:
bun index.js --detect --input ./mic_input_1234567890.mp3 --top 30
```

This helps determine if the issue is:
- **Same wrong result**: Problem with the algorithm or audio quality
- **Different result**: Problem with microphone recording process

### Step 3: Check Recording Output

Look for this output when recording stops:
```
Recorded 150 chunks, total 264600 bytes
Recorded 3.00 seconds
✓ Saved microphone recording: mic_input_1234567890.mp3
```

**If you see "0 chunks" or "0 bytes":**
- Microphone not recording anything
- Check issues below

### Step 4: Listen to the Saved Recording

Play back the MP3 file to hear what was actually recorded:

```bash
# macOS
afplay mic_input_1234567890.mp3

# Linux
mpg123 mic_input_1234567890.mp3

# Or open in any audio player
```

Check for:
- Is the song audible?
- Is there too much background noise?
- Is the audio level too low/high?
- Is there distortion or clipping?

### Step 4: Compare Fingerprints

Test the same song from the database directly:

```bash
# Find the original song in audio_processed/
bun index.js --detect --input audio_processed/The_Weeknd_-_Blinding_Lights.mp3 --top 1
```

It should match itself with a very low avg_diff (< 5). If not, there's a database issue.

## Microphone Not Recording (0 bytes)

If you see "No audio data recorded!" or "0 chunks, total 0 bytes":

### Issue: Microphone permissions not granted
**macOS Solution:**
1. System Settings → Privacy & Security → Microphone
2. Make sure Terminal (or your terminal app) is enabled
3. You may need to restart terminal after granting permission

**Linux Solution:**
```bash
# Check if user is in audio group
groups

# If not in audio group, add yourself:
sudo usermod -a -G audio $USER
# Then log out and back in
```

### Issue: Wrong audio device selected
**macOS Solution:**
```bash
# List audio devices
system_profiler SPAudioDataType

# Set default input device in System Settings → Sound → Input
```

**Linux Solution:**
```bash
# Check audio devices
arecord -l

# Test recording
arecord -d 3 test.wav
aplay test.wav

# If that works, the mic package should work too
```

### Issue: sox not installed (macOS/Windows)
**macOS Solution:**
```bash
brew install sox
```

### Issue: alsa-utils not installed (Linux)
**Linux Solution:**
```bash
# Debian/Ubuntu
sudo apt-get install alsa-utils

# RedHat/Fedora
sudo dnf install alsa-utils
```

### Common Issues and Solutions

#### Issue: Microphone recording sounds distorted
**Solution**: Lower your speaker volume or move microphone farther away

#### Issue: Too much background noise
**Solution**: 
- Record in a quieter environment
- Increase speaker volume (but avoid distortion)
- Try recording a longer clip (10-15 seconds)

#### Issue: Audio level too low
**Solution**: 
- Increase speaker volume
- Check microphone input level in system settings
- Get microphone closer to speakers

#### Issue: Original file doesn't match itself well
**Solution**: 
- There may be an issue with the algorithm settings
- Try different window sizes: `--window 50` or `--window 200`
- Check if the song was processed correctly in the database

#### Issue: Matches wrong song every time
**Possible causes**:
1. **Acoustic issues**: Room echo, speaker quality, mic quality
2. **Algorithm tuning**: May need adjustment for live recordings
3. **Database quality**: Songs may not be processed well

### Advanced Debugging: Compare Fingerprints

If you want to see the actual fingerprint data:

```bash
# Check the database.json for the song
# Find "The_Weeknd_-_Blinding_Lights.mp3"
# Look at the "frequencies" array

# Then run detection with --save-mic and check:
# - Length of fingerprints (should be similar for same duration)
# - Pattern of values (should have similar ranges)
```

### Typical avg_diff Values

For reference, good matches typically have:
- **Same song, same recording**: avg_diff < 1
- **Same song, mic recording**: avg_diff 3-8 (if working well)
- **Different song, same artist**: avg_diff 10-20
- **Different song, different artist**: avg_diff > 20

If your mic recording of "Blinding Lights" shows avg_diff > 15 against the actual song, there's definitely an issue with the recording quality or process.

### Next Steps

After collecting this data:
1. Check if the saved recording sounds like the original song
2. Compare avg_diff values between mic and direct file detection
3. If mic recording sounds good but still matches wrong, the algorithm may need tuning
4. If mic recording sounds bad, focus on improving recording quality

### Tips for Better Microphone Detection

1. **Record longer**: 10-15 seconds gives more data to match
2. **Clean audio path**: Speakers → Air → Microphone (no obstacles)
3. **Good volume**: Loud enough to be clear, not so loud it distorts
4. **Quiet environment**: Minimize background noise
5. **Quality matters**: Better speakers and microphone help significantly

