// ESLint v9 flat config (ESM)
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier";

export default tseslint.config(
    {
        ignores: [
            "node_modules/**",
            "cmp/**",
            "dist/**",
            "tmp-tests/**",
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    prettierConfig,
    {
        files: [ "**/*.ts", "**/*.tsx", "**/*.js" ],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
        },
        plugins: {
            prettier: prettierPlugin,
        },
        rules: {
            "brace-style": [ "error", "1tbs", { allowSingleLine: false } ],
            "nonblock-statement-body-position": [ "error", "beside" ],
            curly: [ "error", "all" ],
            "padding-line-between-statements": [
              "error",
              { blankLine: "always", prev: "*", next: ["if", "for", "while", "do", "switch", "try"] }
            ],
            // Prettier rules
            "prettier/prettier": "error",
        },
    },
    {
        files: [ "**/*.ts", "**/*.tsx" ],
        rules: {},
    }
);
