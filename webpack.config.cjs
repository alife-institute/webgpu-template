const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const FaviconsWebpackPlugin = require('favicons-webpack-plugin');

module.exports = (env) => {
  // Determine which example to build (default to game-of-life)
  const example = env && env.example ? env.example : 'game-of-life';
  const examplePath = `./src/examples/${example}`;

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
