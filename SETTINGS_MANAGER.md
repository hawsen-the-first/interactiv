# Settings Manager

The Settings Manager provides a hidden settings page feature that can be activated by touching specific corners of the screen in sequence. This is useful for creating administrative or configuration interfaces that should not be easily accessible to regular users.

## Features

- **Corner Touch Activation**: Touch sequence (top-left → top-right → bottom-right) to open settings
- **Configurable Touch Zones**: Customize the size of corner detection areas
- **Timeout Protection**: Sequence resets if touches are too slow
- **Exit Behaviors**: Return to previous view or reset to a starting view
- **State Management**: Track settings page activation status
- **Transition Effects**: Fade, slide, or custom transitions

## Basic Usage

```typescript
import { SettingsConfig, SettingsManager } from "../interactiv";
import type { ViewProps } from "../interactiv";

// 1. Create a settings view
const settingsView = new View(
  "settings",
  orchestrator,
  false,
  /* template */ `
    <div class="settings-page">
      <h1>Settings</h1>
      <button id="close-btn">Close Settings</button>
    </div>
  `,
  /* styles */ `
    .settings-page {
      padding: 2rem;
      background: #f0f0f0;
      min-height: 100vh;
    }
  `
);

// 2. Configure the settings manager
const settingsConfig: SettingsConfig = {
  view: settingsView,
  exitBehavior: "reset",
  startingViewId: "home-view",
  cornerTouchRadius: 100, // Size of touch zones (default: 100px)
  touchTimeout: 3000, // Max time between touches (default: 3000ms)
  transitionConfig: {
    type: "fade",
    duration: 300,
  },
};

// 3. Add settings to your page
page.addSettings(settingsView, settingsConfig);
```

## Configuration Options

### SettingsConfig Interface

```typescript
interface SettingsConfig {
  view: View; // Required: The view to display as settings
  exitBehavior?: "reset" | "return"; // Default: 'reset'
  startingViewId?: string; // Required when exitBehavior is 'reset'
  cornerTouchRadius?: number; // Size of corner touch zones (default: 100px)
  touchTimeout?: number; // Max time between touches (default: 3000ms)
  debugMode?: boolean; // Show visual feedback (default: false)
  transitionConfig?: TransitionConfig; // Transition effects
}
```

### Exit Behaviors

**"reset"** (default)

- Returns to the specified `startingViewId` when settings are closed
- Requires `startingViewId` to be set
- Use this when you want a predictable exit point

**"return"**

- Returns to the view that was active before settings were opened
- Does not require `startingViewId`
- Use this for a more natural back-button-like behavior

### Corner Touch Activation

The settings page is activated by touching three corners in sequence:

1. **Top-left corner**: Touch within `cornerTouchRadius` pixels of the top-left
2. **Top-right corner**: Touch within `cornerTouchRadius` pixels of the top-right
3. **Bottom-right corner**: Touch within `cornerTouchRadius` pixels of the bottom-right

**Important Notes:**

- Touches must be in the correct order
- Any touch outside corner zones resets the sequence
- Touching the wrong corner resets the sequence
- The sequence times out after `touchTimeout` milliseconds

## Complete Example

```typescript
import {
  createOrchestrator,
  AppBuilder,
  Page,
  View,
  html,
  css,
} from "../interactiv";
import type { SettingsConfig } from "../interactiv";

const orchestrator = createOrchestrator();
const app = new AppBuilder(orchestrator);

// Create home page with views
const homePage = new Page("home-page", orchestrator, false);

// Create main content view
const homeView = new View(
  "home-view",
  orchestrator,
  false,
  html`<div class="home"><h1>Home</h1></div>`,
  css`
    .home {
      padding: 2rem;
    }
  `
);

// Create settings view
const settingsView = new View(
  "settings-view",
  orchestrator,
  false,
  html`
    <div class="settings">
      <h1>Settings</h1>
      <p>This is a hidden settings page.</p>
      <p>Touch the corners again to exit, or wait for timeout.</p>
    </div>
  `,
  css`
    .settings {
      padding: 2rem;
      background: #333;
      color: white;
      min-height: 100vh;
    }
  `
);

// Add views to page
homePage.addView(homeView);

// Configure and add settings
const settingsConfig: SettingsConfig = {
  view: settingsView,
  exitBehavior: "reset",
  startingViewId: "home-view",
  cornerTouchRadius: 150,
  touchTimeout: 3000,
  transitionConfig: {
    type: "fade",
    duration: 500,
  },
};

homePage.addSettings(settingsView, settingsConfig);

// Add page to app and attach to DOM
app.addPage(homePage);
app.attachToDom();

// Navigate to initial view
app.navigateToView("home-view");
```

## Programmatic Control

The SettingsManager also provides methods for programmatic control:

```typescript
// Access the settings manager through the event bus
const settingsBus = orchestrator.getEventBus("settings-manager");

// Force activate settings
settingsBus.emit("activate-settings", {});

// Force deactivate settings
settingsBus.emit("deactivate-settings", {});
```

## State Management

The settings manager integrates with the global state system:

```typescript
import { subscribeToGlobalState } from "../interactiv";

// Subscribe to settings activation state
subscribeToGlobalState("settings.isActive", (isActive: boolean) => {
  console.log("Settings active:", isActive);
});

// Subscribe to last active view before settings
subscribeToGlobalState("settings.lastActiveViewId", (viewId: string | null) => {
  console.log("Previous view:", viewId);
});
```

## Event Listeners

The settings manager emits events that you can listen to:

```typescript
const settingsBus = orchestrator.getEventBus("settings-manager");

// Listen for settings activation
settingsBus.on("settings-activated", (e) => {
  const { viewId, previousViewId } = e.detail;
  console.log(`Settings opened from ${previousViewId}`);
});

// Listen for settings deactivation
settingsBus.on("settings-deactivated", (e) => {
  const { targetViewId, exitBehavior } = e.detail;
  console.log(`Settings closed with ${exitBehavior} behavior`);
});
```

## Best Practices

1. **Touch Zone Size**: Use larger corner zones (150-200px) for touch screens, smaller (75-100px) for mouse/desktop
2. **Timeout**: Keep timeout between 2-5 seconds for good user experience
3. **Exit Behavior**: Use "reset" for kiosks, "return" for regular apps
4. **Visual Feedback**: Consider adding subtle visual hints in development mode
5. **Settings Content**: Include a clear way to exit settings (button or instructions)

## Security Considerations

While this provides basic protection against casual access, it should NOT be used as a security measure. For sensitive operations:

- Implement proper authentication
- Use password protection
- Add additional security layers
- Don't rely solely on the corner touch sequence

## Troubleshooting

**Settings won't open:**

- Check that corner touches are within the radius
- Ensure touches are in the correct order
- Verify timeout is not too short
- Check console for trace logs (if debug logging enabled)

**Settings immediately close:**

- Check that exitBehavior is configured correctly
- Ensure startingViewId exists when using "reset"
- Verify transitionConfig is valid

**Sequence keeps resetting:**

- Touches may be outside corner zones
- Time between touches may exceed timeout
- Check for conflicting event handlers
