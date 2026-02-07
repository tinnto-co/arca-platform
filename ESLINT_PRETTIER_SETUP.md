# ESLint and Prettier Setup

This project now has ESLint and Prettier configured for TypeScript and React development.

## 📦 Installed Packages

### ESLint
- `eslint` v9.39.2
- `@eslint/js`
- `typescript-eslint`
- `@typescript-eslint/parser`
- `@typescript-eslint/eslint-plugin`
- `eslint-plugin-react`
- `eslint-plugin-react-hooks`
- `eslint-plugin-react-refresh`

### Prettier
- `prettier`
- `eslint-config-prettier` (disables conflicting ESLint rules)
- `eslint-plugin-prettier` (runs Prettier as an ESLint rule)

## 🚀 Available Scripts

Add these scripts to run linting and formatting:

```bash
# Check for linting errors
bun run lint

# Fix linting errors automatically
bun run lint:fix

# Check code formatting
bun run format:check

# Format all files
bun run format
```

## 📝 Configuration Files

- **`eslint.config.js`**: ESLint configuration using the modern flat config format
- **`prettier.config.js`**: Prettier configuration
- **`.prettierignore`**: Files to ignore from formatting
- **`.vscode/settings.json`**: VS Code settings for auto-format on save

## ⚙️ Features

### ESLint Rules
- TypeScript strict type checking
- React best practices
- React Hooks rules
- Unused variables detection
- Console statement warnings
- Consistent type imports
- Promise handling enforcement

### Prettier Settings
- Single quotes
- 2-space indentation
- Semicolons enabled
- 80 character line width
- Trailing commas (ES5)
- LF line endings

## 🔧 VS Code Integration

The `.vscode/settings.json` file enables:
- **Auto-format on save** with Prettier
- **Auto-fix ESLint issues** on save
- ESLint validation for TS/TSX files

### Required VS Code Extensions
- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## 📋 Next Steps

1. **Format your codebase**:
   ```bash
   bun run format
   ```

2. **Fix auto-fixable ESLint issues**:
   ```bash
   bun run lint:fix
   ```

3. **Review remaining issues**:
   ```bash
   bun run lint
   ```

4. **Install VS Code extensions** (if not already installed)

## 🎯 Current Status

- ✅ ESLint is active and detecting issues
- ✅ Prettier is configured and ready
- ⚠️ ~100 files need formatting
- ⚠️ Various linting issues to review/fix

## 🔍 Common Issues and Fixes

### Type Safety Warnings
Many warnings are about type safety (e.g., `@typescript-eslint/no-unsafe-assignment`). These help prevent runtime errors.

### Unused Variables
Variables prefixed with `_` are ignored by the linter (e.g., `_unused`).

### Console Statements
Only `console.warn()` and `console.error()` are allowed. Replace `console.log()` with proper logging or remove in production.

## 🛠️ Customization

To adjust rules, edit:
- **`eslint.config.js`**: Modify the `rules` object
- **`prettier.config.js`**: Change formatting preferences

Example - disable a specific rule:
```javascript
rules: {
  '@typescript-eslint/no-explicit-any': 'off',
}
```

## 📚 Resources

- [ESLint Documentation](https://eslint.org/docs/latest/)
- [Prettier Documentation](https://prettier.io/docs/en/)
- [TypeScript ESLint](https://typescript-eslint.io/)
- [ESLint Plugin React](https://github.com/jsx-eslint/eslint-plugin-react)
