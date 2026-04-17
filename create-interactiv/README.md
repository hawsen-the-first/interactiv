# Create Interactiv

NPX script to scaffold new Interactiv projects with all core features pre-configured.

## Usage

```bash
npx create-interactiv
```

Or with npm 6+:

```bash
npm init interactiv
```

## What's Included

The generated project includes:

- **Page, View, and Component architecture** - Full example with HomePage, HomeView, and ExampleComponent
- **Screensaver functionality** - Activates after 30 seconds of inactivity with a clock display
- **Hidden settings page** - Accessible via corner touch sequence (top-left → top-right → bottom-right)
- **BrightSign-optimized Vite config** - ES2015 target, IIFE format, and MIME type handling
- **TypeScript configuration** - Strict mode enabled with proper module resolution
- **State management** - Example component demonstrating local state and reactivity
- **Event handling** - Touch and mouse event examples with the interactive counter
- **CSS animations** - Optional animation system integration
- **Environment configuration** - Pre-configured .env for BrightSign deployment modes

## Interactive Setup

The CLI will prompt you for:

1. **Project name** - Must contain only lowercase letters, numbers, and hyphens
2. **Enable animations** - Whether to use the Interactiv animation system
3. **Debug logging** - Enable verbose logging for development
4. **Log level** - Minimum log level (error/warn/trace)
5. **Remote repository** - Optional link to existing Git remote
6. **Local IP address** - Your network IP for BrightSign development mode

## Generated Project Structure

```
my-interactiv-app/
├── package.json
├── tsconfig.json
├── vite.config.ts        # BrightSign optimized
├── .env                  # Deployment configuration
├── .gitignore
├── index.html
└── src/
    ├── main.ts          # Application entry point
    ├── styles.css       # Global styles
    ├── pages/
    │   ├── HomePage.ts
    │   └── ScreensaverPage.ts
    ├── views/
    │   ├── HomeView.ts
    │   ├── ScreensaverView.ts
    │   └── SettingsView.ts
    └── components/
        └── ExampleComponent.ts
```

## After Installation

```bash
cd your-project-name
npm run dev
```

## Deployment Modes

The generated project supports three deployment modes configured in `.env`:

- **local** - Local browser preview during development
- **brightsign-dev** - BrightSign loads from your dev server over network
- **production** - BrightSign runs standalone from built files

## Features Demonstrated

### State Management
The ExampleComponent shows local state management with reactive updates.

### Event Handling
Interactive counter demonstrates touch/click event handling with the `point()` method.

### Navigation
Navigation between views using transitions (fade, slide, snap).

### Screensaver
Automatic activation after inactivity with clock display and touch-to-exit.

### Settings Page
Hidden settings activated by corner touch sequence.

## Requirements

- Node.js 18.0.0 or higher
- npm or yarn

## License

ISC
