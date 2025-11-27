export function parseArgs() {
  const args = Bun.argv.slice(2);
  
  const config = {
    windowSize: 100, // default 100ms
    overlap: 0.5, // default 50%
    inputDir: './audio_input',
    processedDir: './audio_processed',
    dbPath: './database.json',
    inputPath: null, // for detector input file
    topResults: 5, // number of top results to show
    saveMicInput: false, // save mic input for debugging
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--window':
        config.windowSize = parseFloat(args[++i]);
        break;
      case '--overlap':
        config.overlap = parseFloat(args[++i]);
        break;
      case '--input-dir':
        config.inputDir = args[++i];
        break;
      case '--processed-dir':
        config.processedDir = args[++i];
        break;
      case '--db-path':
        config.dbPath = args[++i];
        break;
      case '--input':
        config.inputPath = args[++i];
        break;
      case '--top':
        config.topResults = parseInt(args[++i], 10);
        break;
    }
  }
  
  // Check for flags without values
  if (args.includes('--save-mic')) {
    config.saveMicInput = true;
  }

  return config;
}

export function hasFlag(flag) {
  return Bun.argv.includes(flag);
}

