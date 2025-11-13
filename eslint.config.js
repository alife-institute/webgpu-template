import js from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import prettier from "eslint-plugin-prettier";
import typescript from "typescript-eslint";

export default [
  js.configs.recommended,
  ...typescript.configs.recommended,
  prettierConfig,
  {
    languageOptions: {
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        HTMLCanvasElement: "readonly",
        HTMLElement: "readonly",
        MouseEvent: "readonly",
        TouchEvent: "readonly",
        WheelEvent: "readonly",
        Event: "readonly",
        // WebGPU globals
        GPUDevice: "readonly",
        GPUCanvasContext: "readonly",
        GPUTextureFormat: "readonly",
        GPUShaderModule: "readonly",
        GPUBuffer: "readonly",
        GPUTexture: "readonly",
      },
    },
    plugins: {
      prettier: prettier,
    },
    rules: {
      "prettier/prettier": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs", "tools/**/*.js"],
    languageOptions: {
      globals: {
        // Node.js globals
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        module: "readonly",
        require: "readonly",
        exports: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/no-require-imports": "off",
      "no-console": "off",
    },
  },
  {
    ignores: ["dist/**", "node_modules/**", "**/*.d.ts", "webpack.config.cjs", ".capture/**"],
  },
];
