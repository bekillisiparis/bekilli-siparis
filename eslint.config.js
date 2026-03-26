import importPlugin from "eslint-plugin-import";

export default [
  {
    files: ["src/**/*.{js,jsx}"],
    plugins: { import: importPlugin },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: {
      "import/resolver": { node: { extensions: [".js", ".jsx"] } },
    },
    rules: {
      "import/named": "error",
      "import/no-cycle": ["error", { maxDepth: 3 }],
      "no-template-curly-in-string": "warn",
    },
  },
];
