# WebGPU Simulation Capture Tool

A browser automation tool for capturing WebGPU simulation output, console logs, and animation frames.

## Features

- 🌐 **Automated Browser Testing**: Opens URLs in a real Chrome browser with WebGPU support
- 📝 **Console Capture**: Records all console.log, warnings, and errors
- 📸 **Animation Screenshots**: Takes multiple screenshots to capture animation frames
- 📊 **Summary Reports**: Generates JSON summaries of errors, warnings, and statistics
- 🎯 **Configurable**: Flexible command-line options for different use cases

## Installation

The tool is already set up in this project. Puppeteer was installed as a dev dependency during setup.

## Usage

```bash
npm run capture
```

### Command-Line Options

```
--url <url>          URL or file path (default: file://dist/index.html)
--screenshots <n>    Number of screenshots to take (default: 10)
--interval <ms>      Milliseconds between screenshots (default: 500)
--output <dir>       Output directory (default: ./.capture - hidden folder)
--width <px>         Browser width (default: 1024)
--height <px>        Browser height (default: 768)
--headless <bool>    Run in headless mode (default: false - visible browser)
--wait <ms>          Wait time before first screenshot (default: 1000)
--help, -h           Show help message
```

**Note**: The default opens `dist/index.html` directly:
- No dev server needed
- Visible browser by default (so WebGPU screenshots work)
- Run `npm run build` for a specific example first to generate the dist folder
- For live dev server testing: use `--url http://localhost:5500`

## Output Structure

Each capture session creates a timestamped directory:

```
.capture/                        # Hidden folder (ignored by git)
└── session-2025-11-09T22-30-45/
    ├── frame-0000.png           # Screenshot frames
    ├── frame-0001.png
    ├── frame-0002.png
    ├── ...
    ├── console.log              # Human-readable console output
    ├── console.json             # Structured console data
    └── summary.json             # Capture statistics and errors
```

### Output Files

**Screenshots** (`frame-NNNN.png`):
- PNG images of each animation frame
- Numbered sequentially with zero-padding
- Can be combined into videos or GIFs

**Console Log** (`console.log`):
- Plain text format
- Timestamped entries
- All console output including logs, warnings, errors

**Console JSON** (`console.json`):
- Structured JSON format
- Programmatic access to logs
- Includes timestamps and message types

**Summary** (`summary.json`):
- Capture metadata (URL, resolution, timing)
- Console message statistics by type
- List of all errors and warnings
- Quick overview of capture session

## Use Cases

### 1. Debugging WebGPU Issues

Check if your simulation is working without opening a browser:

```bash
npm run capture:quick
cat .capture/session-*/console.log
```

Look for errors or warnings in the console output.

### 2. Testing Different Configurations

Capture simulations with different parameters:

```bash
# Test at different resolutions
for size in 512 1024 2048; do
  node tools/capture-simulation.js --width $size --height $size --output "capture-${size}"
done
```

### 3. CI/CD Integration

Add to your continuous integration pipeline:

```bash
#!/bin/bash
# Start dev server in background
npm start &
SERVER_PID=$!

# Wait for server to be ready
sleep 5

# Capture and check for errors
npm run capture:quick

# Check if any errors occurred
if jq -e '.errors | length > 0' .capture/session-*/summary.json; then
  echo "❌ Errors detected in simulation"
  exit 1
fi

# Cleanup
kill $SERVER_PID
```

## Troubleshooting

### "Failed to load page"

Make sure the dev server is running:
```bash
npm start
```

### "WebGPU not supported"

The tool uses Chrome with WebGPU flags enabled. If you still see this error:
1. Update to Chrome 113+
2. Check if `--enable-unsafe-webgpu` flag is present in the script
3. Try running with `--headless false` to see the actual browser

### "ECONNREFUSED"

The URL is not accessible. Common causes:
- Dev server not running
- Wrong port number (default is 5500)
- Firewall blocking localhost

### No screenshots captured

Check the console output in `console.log` for errors. The page might be crashing before screenshots can be taken.

## Tips

1. **Start small**: Use `capture:quick` first to verify everything works
2. **Check logs**: Always review `console.log` for errors
3. **Adjust timing**: If animation is too fast/slow, adjust `--interval`
4. **Resolution matters**: Higher resolution = larger files but better quality
5. **Headless issues**: If weird errors occur, try `--headless false` to see what's happening

## Advanced: Creating Videos from Frames

**Using ffmpeg:**

```bash
# Install ffmpeg (if not already installed)
sudo apt install ffmpeg  # Ubuntu/Debian
brew install ffmpeg      # macOS

# Create MP4 video from frames
ffmpeg -framerate 30 -pattern_type glob -i '.capture/session-*/frame-*.png' \
  -c:v libx264 -pix_fmt yuv420p output.mp4

# Create animated GIF
ffmpeg -framerate 10 -pattern_type glob -i '.capture/session-*/frame-*.png' \
  -vf "scale=512:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" \
  output.gif
```