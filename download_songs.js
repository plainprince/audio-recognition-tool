import { $ } from "bun";
import { existsSync } from "node:fs";

async function downloadSongs() {
  console.log('YouTube Music Downloader');
  console.log('========================\n');

  // Load songs.json
  const file = Bun.file('./songs.json');
  if (!existsSync('./songs.json')) {
    console.error('Error: songs.json not found');
    process.exit(1);
  }

  const data = await file.json();
  const songs = data.playlist.songs;

  console.log(`Found ${songs.length} songs to download\n`);

  // Check if yt-dlp is installed
  try {
    await $`which yt-dlp`.quiet();
  } catch {
    console.error('Error: yt-dlp is not installed');
    console.error('Install with: brew install yt-dlp (macOS) or pip install yt-dlp');
    process.exit(1);
  }

  // Create output directory if it doesn't exist
  if (!existsSync('./audio_input')) {
    await $`mkdir -p audio_input`;
  }

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];
    const progress = `[${i + 1}/${songs.length}]`;
    
    console.log(`${progress} ${song.artist} - ${song.title}`);
    
    // Create safe filename
    const safeArtist = song.artist.replace(/[^a-z0-9]/gi, '_');
    const safeTitle = song.title.replace(/[^a-z0-9]/gi, '_');
    const filename = `${safeArtist}_-_${safeTitle}.%(ext)s`;
    const outputPath = `audio_input/${filename}`;

    try {
      // Download with yt-dlp
      // -x: extract audio
      // --audio-format mp3: convert to mp3
      // --audio-quality 5: medium quality (0=best, 9=worst)
      // --no-playlist: don't download playlists
      // --quiet: suppress output
      // --no-warnings: suppress warnings
      await $`yt-dlp -x --audio-format mp3 --audio-quality 5 --no-playlist -o ${outputPath} ${song.url}`.quiet();
      
      console.log(`  ✓ Downloaded successfully\n`);
      downloaded++;
    } catch (error) {
      console.log(`  ✗ Failed (broken link or error)\n`);
      failed++;
    }
  }

  console.log('========================');
  console.log('Summary:');
  console.log(`Downloaded: ${downloaded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${songs.length}`);
}

downloadSongs().catch(console.error);

