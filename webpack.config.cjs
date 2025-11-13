const path = require("path");
const fs = require("fs");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const FaviconsWebpackPlugin = require('favicons-webpack-plugin');

module.exports = (env) => {
  // Require example to be specified
  if (!env || !env.example) {
    console.error('\n❌ Error: No example specified!');
    console.error('\nUsage:');
    console.error('  npm run build -- --env example=game-of-life');
    console.error('  npm start -- --env example=stable-fluids');
    console.error('  npm run watch -- --env example=game-of-life');

    // List available examples
    const examplesDir = path.resolve(__dirname, 'src/examples');
    if (fs.existsSync(examplesDir)) {
      const examples = fs.readdirSync(examplesDir)
        .filter(name => {
          const examplePath = path.join(examplesDir, name);
          return fs.statSync(examplePath).isDirectory() &&
            fs.existsSync(path.join(examplePath, 'index.ts'));
        });

      if (examples.length > 0) {
        console.error('\n📚 Available examples:');
        examples.forEach(ex => console.error(`  - ${ex}`));
      }
    }
    console.error('');
    process.exit(1);
  }

  const example = env.example;
  const examplePath = `./src/examples/${example}`;

  // Verify example exists
  const fullExamplePath = path.resolve(__dirname, examplePath);
  if (!fs.existsSync(path.join(fullExamplePath, 'index.ts'))) {
    console.error(`\n❌ Error: Example "${example}" not found!`);
    console.error(`\nLooked for: ${fullExamplePath}/index.ts`);

    // List available examples
    const examplesDir = path.resolve(__dirname, 'src/examples');
    if (fs.existsSync(examplesDir)) {
      const examples = fs.readdirSync(examplesDir)
        .filter(name => {
          const examplePath = path.join(examplesDir, name);
          return fs.statSync(examplePath).isDirectory() &&
            fs.existsSync(path.join(examplePath, 'index.ts'));
        });

      if (examples.length > 0) {
        console.error('\n📚 Available examples:');
        examples.forEach(ex => console.error(`  - ${ex}`));
      }
    }
    console.error('');
    process.exit(1);
  }

  return {
    mode: "development",
    entry: {
      index: path.resolve(__dirname, examplePath, 'index.ts'),
    },
    devtool: "inline-source-map",
    devServer: {
      static: "./dist",
    },
    plugins: [
      new HtmlWebpackPlugin({
        title: `WebGPU - ${example}`,
        template: "src/index.html",
      }),
      new FaviconsWebpackPlugin('src/assets/favicon.ico'),
    ],
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
        {
          test: /\.wgsl/,
          type: "asset/source",
        },
      ],
    },
    resolve: {
      extensions: [".tsx", ".ts", ".js"],
    },
    output: {
      filename: "[name].bundle.js",
      path: path.resolve(__dirname, "dist"),
      clean: true,
    },
    optimization: {
      runtimeChunk: "single",
    },
  };
};
