# Interactiv

A TypeScript framework for building embedded interactive applications with event management, state management, navigation, and screensaver functionality. The package is designed to maximise compatibility with older versions of Node/Chromium, specifically to work with BrightSign media players. 

The package also emphsises support for touchscreen input, but can also be used for cursor/poiner device inputs. 

## Installation

### Local Development with npm link

Since this is a local package, you can install it in your projects using npm link:

```bash
# In the interactiv package directory
npm link

# In your project directory
npm link interactiv
```

## Features

- **Event Management**: Unified pointer interactions (mouse & touch)
- **State Management**: Global and external state management with subscriptions
- **Navigation**: Page and view-based navigation system
- **Screensaver**: Built-in screensaver functionality
- **Settings Manager**: Hidden settings page with corner touch activation
- **Animation Bus**: Animation coordination system
- **App Builder**: Component-based application architecture

## Basic Usage

```typescript
import {
  createOrchestrator,
  AppBuilder,
  Page,
  View,
  Component,
  html,
  css,
} from "interactiv";

// Import animations CSS
import "interactiv/animations.css";

// Create orchestrator
const orchestrator = createOrchestrator();

// Create app
const app = new AppBuilder(orchestrator);

// Create a page
const homePage = new Page("home-page", orchestrator, false);

// Create a view
const homeView = new View(
  "home-view",
  orchestrator,
  false,
  html`<div class="home"><h1>Welcome</h1></div>`,
  css`.home { padding: 2rem; }`
);

// Add view to page
homePage.addView(homeView);

// Add page to app
app.addPage(homePage);

// Attach to DOM
app.attachToDom();

// Navigate to view
app.navigateToView("home-view");
```

## Core Modules

### Event Orchestrator

Create and manage event buses for communication between components:

```typescript
import { createOrchestrator } from "interactiv";

const orchestrator = createOrchestrator();
const eventBus = orchestrator.registerEventBus("my-bus");

eventBus.on("my-event", (event) => {
  console.log(event.detail);
});

eventBus.emit("my-event", { data: "Hello!" });
```

### State Management

Manage global application state with subscriptions:

```typescript
import {
  setGlobalState,
  getGlobalState,
  subscribeToGlobalState,
} from "interactiv";

// Set state
setGlobalState("user.name", "John");

// Get state
const userName = getGlobalState("user.name");

// Subscribe to changes
subscribeToGlobalState("user.name", (value) => {
  console.log("Name changed:", value);
});
```

### Navigation Manager

Navigate between pages and views:

```typescript
import { NavigationManager } from "interactiv";

const navManager = new NavigationManager(orchestrator);

// Navigate to a page
navManager.navigateToPage("home-page");

// Navigate to a view
navManager.navigateToView("home-view");
```

### Event Manager

Handle pointer interactions (mouse & touch) in components:

```typescript
import { EventManager } from "interactiv";

const eventManager = new EventManager(shadowRoot, "my-component");

// Point interaction (click/tap)
eventManager.point(".button", (data) => {
  console.log("Clicked at:", data.x, data.y);
});

// Hover interaction
eventManager.hover(".item", {
  enter: (data) => console.log("Hover enter"),
  leave: (data) => console.log("Hover leave"),
});

// Drag interaction
eventManager.drag(".draggable", {
  start: (data) => console.log("Drag start"),
  move: (data) => console.log("Dragging"),
  end: (data) => console.log("Drag end"),
});
```

### Settings Manager

Create hidden settings pages with corner touch activation. See [SETTINGS_MANAGER.md](./SETTINGS_MANAGER.md) for detailed documentation.

## Template Helpers

Use the `html` and `css` tagged template literals for better IDE support:

```typescript
import { html, css } from "interactiv";

const template = html`
  <div class="container">
    <h1>Title</h1>
  </div>
`;

const styles = css`
  .container {
    padding: 1rem;
  }
`;
```

## TypeScript Support

This package includes full TypeScript definitions. Import types as needed:

```typescript
import type {
  PageProps,
  ViewProps,
  ComponentProps,
  PointerEventData,
  DragCallbacks,
  HoverCallbacks,
  SwipeCallbacks,
  StateSubscription,
} from "interactiv";
```

## Development

### Building the Package

```bash
npm run build
```

This compiles TypeScript to JavaScript and copies the CSS file to the dist folder.

### Linting and Formatting

```bash
# Lint
npm run lint

# Format
npm run format

# Check both
npm run check
```

## License

ISC

## Contributing

Contributions are welcome! Please ensure all code passes linting and formatting checks before submitting.
