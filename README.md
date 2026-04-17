# Interactiv

A TypeScript framework for building embedded interactive applications with event management, state management, navigation, and screensaver functionality. The package is designed to maximise compatibility with older versions of Node/Chromium, specifically to work with BrightSign media players. 

The package also emphsises support for touchscreen input, but can also be used for cursor/poiner device inputs. 
test change
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

// Navigate to view - Two equivalent methods:

// Method 1: Via AppBuilder (convenient when you have app reference)
app.navigateToView("home-view");

// Method 2: Via Orchestrator directly (recommended in components)
orchestrator.navigateToView("home-view", {
  type: "fade",
  duration: 300
});
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

**Important:** NavigationManager is a singleton service that should not be instantiated directly. It is automatically created by AppBuilder, and you access navigation methods through your AppBuilder instance.

Navigate between pages and views:

```typescript
// ✅ Correct: Use navigation through AppBuilder
const app = new AppBuilder(orchestrator);

// Add your pages and views
app.addPage(homePage);

// Navigate to a page
app.navigateToPage("home-page");

// Navigate to a view with optional transition
app.navigateToView("home-view", {
  type: "fade",
  duration: 300,
  easing: "ease-in-out"
});

// Get current navigation state
const currentPageId = app.getCurrentPageId();
const currentViewId = app.getCurrentViewId();
const isTransitioning = app.isTransitioning();
```

**❌ Incorrect Usage:**
```typescript
// Don't create NavigationManager directly - this will throw an error!
const navManager = new NavigationManager(orchestrator); // ERROR!
```

The NavigationManager uses shared global state and event bus namespaces. Creating multiple instances would cause:
- Conflicting global state management
- Event bus namespace collisions
- Ambiguous navigation routing

For this reason, only one instance exists per application, managed by AppBuilder.

#### Navigating from Within Components

All components have access to the `orchestrator` via `this.orchestrator`, making navigation simple and consistent:

```typescript
import { Component } from "interactiv";

class MyComponent extends Component {
  constructor(id: string, orchestrator: EventOrchestrator) {
    super(id, orchestrator);
    this.setupNavigation();
  }

  private setupNavigation(): void {
    // Navigate to a view when button is clicked
    this.point(".nav-button", () => {
      this.orchestrator.navigateToView("target-view", {
        type: "slide",
        direction: "left",
        duration: 300
      });
    });

    // Navigate to a page
    this.point(".page-button", () => {
      this.orchestrator.navigateToPage("target-page", {
        type: "fade",
        duration: 400
      });
    });
  }

  protected defineTemplate(): void {
    this.template = html`
      <div>
        <button class="nav-button">Go to View</button>
        <button class="page-button">Go to Page</button>
      </div>
    `;
  }

  protected defineStyles(): void {
    this.styles = css`
      button {
        padding: 1rem;
        margin: 0.5rem;
      }
    `;
  }
}
```

**Key Benefits:**
- Simple and direct API - no need to access event bus manually
- Consistent mental model: orchestrator coordinates everything
- Less boilerplate code
- Type-safe navigation methods

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

### Screensaver Manager

The screensaver manager monitors user activity and triggers actions after a configurable timeout period. It supports two modes:

#### Standard Screensaver Mode

Navigate to a dedicated screensaver page after inactivity. User activity exits the screensaver and returns to the previous or starting page.

```typescript
// Create a screensaver page with views
const screensaverPage = new Page("screensaver-page", orchestrator, false);
const screensaverView = new View("screensaver-view", orchestrator, false, 
  html`<div class="screensaver">...</div>`,
  css`.screensaver { /* styles */ }`
);
screensaverPage.addView(screensaverView);

// Add screensaver with standard behavior
app.addScreensaver(screensaverPage, {
  timeoutSeconds: 30,
  defaultViewId: "screensaver-view",
  exitBehavior: "return",       // Return to where the user was before
  transitionConfig: { type: "fade", duration: 500 },
});
```

#### Return-to-Home Mode

Instead of showing a screensaver, navigate back to a specified home page/view after inactivity. No screensaver page is needed — the app simply redirects to the home screen. The screensaver never enters an "active" state, so user activity just resets the inactivity timer.

```typescript
// No screensaver page needed — pass null
app.addScreensaver(null, {
  timeoutSeconds: 60,
  screensaverViewBehavior: "returnHome",
  startingPageId: "home-page",    // The home page to navigate to
  defaultViewId: "home-view",     // Optional: the home view to show
  transitionConfig: { type: "fade", duration: 500 },
});
```

#### Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `timeoutSeconds` | `number` | Seconds of inactivity before activation |
| `page` | `Page` | Screensaver page (required unless using `returnHome`) |
| `screensaverViewBehavior` | `"default" \| "specific" \| "return" \| "returnHome"` | How to handle the view on activation |
| `defaultViewId` | `string` | Default view to show (or home view for `returnHome`) |
| `exitBehavior` | `"reset" \| "return"` | Where to go when exiting the screensaver |
| `startingPageId` | `string` | Page to navigate to on exit/reset (or home page for `returnHome`) |
| `startingViewId` | `string` | View within the starting page on exit |
| `transitionConfig` | `TransitionConfig` | Transition animation configuration |
| `activateCallback` | `() => void` | Called when screensaver activates or returns home |
| `deactivateCallback` | `() => void` | Called when screensaver deactivates |
| `blockerCallback` | `() => boolean` | Return `true` to prevent activation |
| `rebootTimeout` | `number \| null` | Minutes before triggering a reboot callback |
| `rebootCallback` | `() => void` | Called when reboot timeout elapses |

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
