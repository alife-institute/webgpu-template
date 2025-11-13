#!/usr/bin/env node

/**
 * WebGPU Simulation Capture Tool
 *
 * This tool uses Puppeteer to:
 * 1. Open dist/index.html directly in Chrome (no server needed)
 * 2. Capture console output (logs, warnings, errors)
 * 3. Take multiple screenshots over time to capture animation
 *
 * Usage:
 *   npm run build              # Build dist/index.html first
 *   node tools/capture-simulation.js [options]
 *
 * Options:
 *   --url <url>          URL or file path (default: file://dist/index.html)
 *   --screenshots <n>    Number of screenshots to take (default: 10)
 *   --interval <ms>      Milliseconds between screenshots (default: 500)
 *   --output <dir>       Output directory (default: ./.capture)
 *   --width <px>         Browser width (default: 1024)
 *   --height <px>        Browser height (default: 768)
 *   --headless <bool>    Run in headless mode (default: false)
 *   --wait <ms>          Wait time before first screenshot (default: 1000)
 */

const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

// Parse command line arguments
function parseArgs() {
  // Default to local dist/index.html file
  const distPath = path.resolve(__dirname, "../dist/index.html");
  const defaultUrl = `file://${distPath}`;

  const args = {
    url: defaultUrl,
    screenshots: 10,
    interval: 500,
    output: "./.capture",
    width: 1024,
    height: 768,
    headless: false, // Non-headless by default so WebGPU screenshots work
    wait: 1000,
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    const next = process.argv[i + 1];

    switch (arg) {
      case "--url":
        args.url = next;
        i++;
        break;
      case "--screenshots":
        args.screenshots = parseInt(next);
        i++;
        break;
      case "--interval":
        args.interval = parseInt(next);
        i++;
        break;
      case "--output":
        args.output = next;
        i++;
        break;
      case "--width":
        args.width = parseInt(next);
        i++;
        break;
      case "--height":
        args.height = parseInt(next);
        i++;
        break;
      case "--headless":
        args.headless = next !== "false";
        i++;
        break;
      case "--wait":
        args.wait = parseInt(next);
        i++;
        break;
      case "--help":
      case "-h":
        console.log(`
WebGPU Simulation Capture Tool

Usage:
  node tools/capture-simulation.js [options]

Options:
  --url <url>          URL or file path to capture (default: file://dist/index.html)
  --screenshots <n>    Number of screenshots to take (default: 10)
  --interval <ms>      Milliseconds between screenshots (default: 500)
  --output <dir>       Output directory (default: ./.capture)
  --width <px>         Browser width (default: 1024)
  --height <px>        Browser height (default: 768)
  --headless <bool>    Run in headless mode (default: false - visible browser)
  --wait <ms>          Wait time before first screenshot (default: 1000)
  --help, -h           Show this help message

Note:
  - Captures are saved to .capture/ (hidden folder) by default to avoid git commits.
  - Default opens dist/index.html directly (no server needed) with visible browser
  - WebGPU rendering requires non-headless mode for screenshots to work
  - Run 'npm run build' first to generate dist/index.html
        `);
        process.exit(0);
    }
  }

  return args;
}

// Create output directory if it doesn't exist
function ensureOutputDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Format timestamp for filenames
function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
}

async function captureSimulation() {
  const args = parseArgs();
  const outputDir = path.resolve(args.output);
  const sessionDir = path.join(outputDir, `session-${timestamp()}`);

  console.log("🚀 WebGPU Simulation Capture Tool\n");
  console.log("Configuration:");
  console.log(`  URL:         ${args.url}`);
  console.log(`  Screenshots: ${args.screenshots}`);
  console.log(`  Interval:    ${args.interval}ms`);
  console.log(`  Resolution:  ${args.width}x${args.height}`);
  console.log(`  Output:      ${sessionDir}`);
  console.log(`  Headless:    ${args.headless}`);
  console.log("");

  // Create output directory
  ensureOutputDir(sessionDir);

  // Store console logs
  const consoleLogs = [];

  console.log("📦 Launching browser...");
  const browser = await puppeteer.launch({
    headless: args.headless,
    args: [
      "--enable-unsafe-webgpu",
      "--enable-features=Vulkan",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: args.width, height: args.height });

    // Capture console output
    page.on("console", (msg) => {
      const type = msg.type();
      const text = msg.text();
      const timestamp = new Date().toISOString();

      consoleLogs.push({
        timestamp,
        type,
        text,
      });

      // Print to console with emoji indicators
      const emoji =
        {
          log: "📝",
          info: "ℹ️",
          warn: "⚠️",
          error: "❌",
          debug: "🔍",
        }[type] || "💬";

      console.log(`${emoji} [${type.toUpperCase()}] ${text}`);
    });

    // Capture page errors
    page.on("pageerror", (error) => {
      consoleLogs.push({
        timestamp: new Date().toISOString(),
        type: "pageerror",
        text: error.toString(),
      });
      console.log(`❌ [PAGE ERROR] ${error.toString()}`);
    });

    // Navigate to the URL
    console.log(`\n🌐 Navigating to ${args.url}...`);
    try {
      await page.goto(args.url, {
        waitUntil: "networkidle0",
        timeout: 30000,
      });
      console.log("✅ Page loaded successfully\n");
    } catch (error) {
      console.error(`❌ Failed to load page: ${error.message}`);
      throw error;
    }

    // Wait for initial render
    console.log(`⏱️  Waiting ${args.wait}ms for initial render...`);
    await new Promise((resolve) => setTimeout(resolve, args.wait));

    // Capture screenshots
    console.log(`\n📸 Capturing ${args.screenshots} screenshots...\n`);
    for (let i = 0; i < args.screenshots; i++) {
      const screenshotPath = path.join(sessionDir, `frame-${String(i).padStart(4, "0")}.png`);
      await page.screenshot({ path: screenshotPath });

      const progress = Math.round(((i + 1) / args.screenshots) * 100);
      const bar = "█".repeat(Math.floor(progress / 2)) + "░".repeat(50 - Math.floor(progress / 2));
      console.log(`  [${bar}] ${progress}% - Frame ${i + 1}/${args.screenshots}`);

      if (i < args.screenshots - 1) {
        await new Promise((resolve) => setTimeout(resolve, args.interval));
      }
    }

    console.log("\n✅ All screenshots captured!\n");

    // Save console logs
    const logPath = path.join(sessionDir, "console.log");
    const jsonLogPath = path.join(sessionDir, "console.json");

    // Save as text
    const logText = consoleLogs
      .map((log) => `[${log.timestamp}] [${log.type.toUpperCase()}] ${log.text}`)
      .join("\n");
    fs.writeFileSync(logPath, logText);

    // Save as JSON for programmatic access
    fs.writeFileSync(jsonLogPath, JSON.stringify(consoleLogs, null, 2));

    console.log("📄 Console logs saved:");
    console.log(`  Text: ${logPath}`);
    console.log(`  JSON: ${jsonLogPath}`);

    // Generate summary report
    const summary = {
      captureTime: new Date().toISOString(),
      url: args.url,
      screenshots: args.screenshots,
      interval: args.interval,
      resolution: `${args.width}x${args.height}`,
      consoleMessages: {
        total: consoleLogs.length,
        byType: consoleLogs.reduce((acc, log) => {
          acc[log.type] = (acc[log.type] || 0) + 1;
          return acc;
        }, {}),
      },
      errors: consoleLogs.filter((log) => log.type === "error" || log.type === "pageerror"),
      warnings: consoleLogs.filter((log) => log.type === "warn"),
    };

    const summaryPath = path.join(sessionDir, "summary.json");
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

    console.log("\n📊 Summary:");
    console.log(`  Total console messages: ${summary.consoleMessages.total}`);
    Object.entries(summary.consoleMessages.byType).forEach(([type, count]) => {
      console.log(`    ${type}: ${count}`);
    });
    console.log(`  Errors: ${summary.errors.length}`);
    console.log(`  Warnings: ${summary.warnings.length}`);

    if (summary.errors.length > 0) {
      console.log("\n⚠️  Errors detected:");
      summary.errors.forEach((err) => {
        console.log(`  - ${err.text}`);
      });
    }

    console.log(`\n✨ All files saved to: ${sessionDir}`);
  } catch (error) {
    console.error(`\n❌ Error during capture: ${error.message}`);
    throw error;
  } finally {
    console.log("\n🔒 Closing browser...");
    await browser.close();
  }
}

// Run the capture
captureSimulation()
  .then(() => {
    console.log("\n✅ Capture completed successfully!\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Capture failed:", error);
    process.exit(1);
  });
