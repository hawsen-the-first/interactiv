# Testing Create Interactiv Locally

## Test the CLI locally before publishing

### Method 1: Using npm link (Recommended for testing)

```bash
# In the create-interactiv directory
cd create-interactiv
npm link

# Now you can run it from anywhere
create-interactiv

# When done testing, unlink
npm unlink -g create-interactiv
```

### Method 2: Direct execution

```bash
# From the interactiv root directory
node create-interactiv/bin/cli.js
```

### Method 3: Using npm pack (Test as if published)

```bash
# In the create-interactiv directory
cd create-interactiv
npm pack

# This creates a .tgz file. Install it globally:
npm install -g create-interactiv-1.0.0.tgz

# Test it
create-interactiv

# Clean up
npm uninstall -g create-interactiv
```

## Publishing to NPM

Once testing is complete:

1. **Login to NPM** (if not already logged in):
   ```bash
   npm login
   ```

2. **Publish the package**:
   ```bash
   cd create-interactiv
   npm publish
   ```

3. **Test the published package**:
   ```bash
   npx create-interactiv
   ```

## Updating the Package

When making changes:

1. Update the version in `package.json` (follow semver)
2. Commit changes
3. Publish again:
   ```bash
   npm publish
   ```

## Version Guidelines

- **Patch** (1.0.X): Bug fixes, no new features
- **Minor** (1.X.0): New features, backwards compatible
- **Major** (X.0.0): Breaking changes

## Expected Behavior

When running `create-interactiv`, the CLI should:

1. Display a welcome message
2. Prompt for project configuration:
   - Project name
   - Enable animations
   - Debug mode
   - Log level
   - Remote repository link
   - Local IP address
3. Create project directory
4. Copy and process template files
5. Initialize git repository
6. Install dependencies
7. Display success message with next steps

## Troubleshooting

### Permission Errors
If you get permission errors on the CLI:
```bash
chmod +x create-interactiv/bin/cli.js
```

### Module Not Found
Ensure all dependencies are installed:
```bash
cd create-interactiv
npm install
```

### Template Variables Not Replaced
Check that the `copyTemplate` function is properly replacing all `{{VARIABLE}}` placeholders.
