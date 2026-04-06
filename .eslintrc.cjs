module.exports = {
  root: true,
  ignorePatterns: ['**/dist/**', '**/node_modules/**'],
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      plugins: ['react-hooks'],
      extends: ['eslint:recommended'],
      rules: {
        // TypeScript handles symbol checking for this project.
        'no-unused-vars': 'off',
        'no-undef': 'off',
        // Keep lint baseline non-disruptive while existing code is migrated.
        'no-case-declarations': 'off',
        'no-constant-condition': 'off',
        'no-useless-escape': 'off',
        'no-empty': 'off',
      },
    },
  ],
};
