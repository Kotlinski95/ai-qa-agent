import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'off', // Allow console in Lambda functions
      'prefer-const': 'error',
      'no-var': 'error',
      
      // Zero-comment policy - force self-documenting code
      'no-inline-comments': 'error',
      'no-warning-comments': ['error', { 
        'terms': ['todo', 'fixme', 'hack', 'xxx', 'note', 'comment'], 
        'location': 'anywhere' 
      }],
      
      // Use a custom rule to detect ALL comments
      'no-restricted-syntax': [
        'error',
        {
          'selector': 'Program Comment, Program > * Comment, Program > * > * Comment, Program > * > * > * Comment',
          'message': 'Comments are forbidden. Use self-documenting code with descriptive names, types, and clear logic. If absolutely necessary, add // eslint-disable-line before the comment.'
        }
      ],
      
      // Additional rules that encourage self-documenting code
      'prefer-template': 'error',
      'no-magic-numbers': ['warn', { 'ignore': [0, 1, -1, 2] }],
      
      // Additional rules that reduce need for comments
      'complexity': ['warn', 10], // Encourage simpler functions
      'max-lines-per-function': ['warn', 50], // Keep functions small and focused
      'max-depth': ['error', 4], // Limit nesting depth
      'max-params': ['error', 4], // Limit function parameters
    },
  },
  {
    ignores: ['dist/**/*', 'node_modules/**/*', '*.js', 'dev-server.js', 'test-*.js'],
  },
];