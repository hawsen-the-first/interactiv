# Transition Overlay System

The Transition Overlay System provides a framework-level mechanism to visually mask content changes during state updates. Instead of users seeing content swap instantly or partially fade behind a semi-transparent overlay, the system:

1. Fades an opaque overlay **in**
2. **Waits** until fully opaque
3. **Executes state changes** (DOM updates happen while hidden)
4. **Waits** a configurable hold duration
5. Fades the overlay **out** to reveal the new content

This eliminates the need for consuming applications to manually create overlay divs, manage CSS classes, or approximate transition timing with `setTimeout`.

---

## Features

- **Page-level overlay configuration** — Each `Page` can opt into the overlay system
- **Automatic NavigationManager integration** — View navigation automatically uses the overlay when enabled
- **Event bus integration** — Deeply nested components can request transitions without direct Page references
- **Concurrency handling** — Batches multiple requests during a single transition cycle
- **BrightSign optimized** — Uses CSS transitions only, `will-change: opacity`, minimal reflows
- **Backwards compatible** — Pages without overlays behave exactly as before

---

## API Reference

### Page Methods

#### `page.useTransitionOverlay(config)`

Enables the transition overlay for a page.

```typescript
page.useTransitionOverlay({
  backgroundColor: '#000',   // CSS color (default: '#000')
  fadeInDuration: 200,       // ms (default: 200)
  holdDuration: 100,         // ms (default: 100)
  fadeOutDuration: 200,      // ms (default: 200)
  zIndex: 100,               // overlay z-index (default: 100)
});
```

**When to call:** After page construction, before adding to AppBuilder.

**What it does:**
- Creates an overlay `<div>` in the Page's shadow DOM
- Registers the `"page-transition-overlay"` event bus
- Listens for transition requests and executes them with the overlay lifecycle

---

#### `page.transitionWithOverlay(callback)`

Execute a callback wrapped in the overlay transition.

```typescript
await page.transitionWithOverlay(async () => {
  setGlobalState('region', 'northland');
  setGlobalState('language', 'ma');
});
```

**Returns:** `Promise<void>` that resolves after the full transition completes.

**Throws:** Error if `useTransitionOverlay()` hasn't been called.

**Use case:** Direct Page-level access. For deeply nested components, prefer the standalone `transitionWithOverlay` utility.

---

#### `page.hasTransitionOverlay()`

Check if the page has an overlay enabled.

```typescript
if (page.hasTransitionOverlay()) {
  // Overlay is available
}
```

---

### Standalone Utility

#### `transitionWithOverlay(orchestrator, callback, config?)`

The recommended way for components to request transitions from anywhere in the component tree.

```typescript
import { transitionWithOverlay } from '@hawsen-the-first/interactiv';

await transitionWithOverlay(orchestrator, async () => {
  setGlobalState('currentLocationId', 'kororareka');
});
```

**Parameters:**
- `orchestrator` — The EventOrchestrator instance
- `callback` — Function to execute during the transition (while overlay is opaque)
- `config` — Optional per-request config overrides

**Behavior:**
- If a page-level overlay exists, uses it
- Otherwise, executes the callback directly (graceful fallback)
- Returns a promise that resolves after the transition completes

---

### Event Bus Integration

Components can also request transitions by emitting to the `"page-transition-overlay"` event bus:

```typescript
const transitionBus = orchestrator.getEventBus("page-transition-overlay");

if (transitionBus) {
  transitionBus.emit("request-transition", {
    stateChanges: [
      { key: 'region', value: 'northland' },
      { key: 'currentLocationId', value: 'kororareka' },
    ],
    afterStateChange: async () => {
      // Optional callback after state changes
      const navBus = orchestrator.getEventBus("navigation-manager");
      navBus.emit("navigate-to-view", { viewId: 'map-view' });
    },
    // Optional: per-request overrides
    fadeInDuration: 150,
    holdDuration: 50,
    fadeOutDuration: 150,
  });
}
```

**Event payload:**
- `stateChanges` — Array of `{ key: string, value: any }` objects to apply via `setGlobalState`
- `afterStateChange` — Optional callback to run after state changes (can be async)
- `fadeInDuration`, `holdDuration`, `fadeOutDuration` — Optional per-request overrides

---

## NavigationManager Integration

When a page has `useTransitionOverlay()` enabled:

- View navigation requests (`navigate-to-view`) **automatically use the overlay**
- The view swap happens **instantly while the overlay is opaque** (no fade animation)
- `navigation.isTransitioning` remains `true` for the **full overlay lifecycle**
- The existing `type: "fade", duration: 0` transition config used by consuming apps works seamlessly

**Before (without overlay):**
```typescript
orchestrator.navigateToView('map-view', { type: 'fade', duration: 300 });
// User sees content partially visible through semi-transparent fade
```

**After (with overlay):**
```typescript
page.useTransitionOverlay({ fadeInDuration: 200, fadeOutDuration: 200 });
orchestrator.navigateToView('map-view', { type: 'fade', duration: 0 });
// Content swap is completely hidden behind opaque overlay
```

---

## Concurrency Strategy

**Multiple requests during a single transition:**

- **Fade-in or hold phase:** Incoming requests batch their callbacks into the current cycle's hold phase
- **Fade-out phase:** Incoming requests queue for the next transition cycle

This ensures smooth transitions without jarring interruptions or visible content changes.

---

## Usage Examples

### Example 1: Basic Setup

```typescript
import { 
  Page, 
  createOrchestrator, 
  setGlobalState 
} from '@hawsen-the-first/interactiv';

const orchestrator = createOrchestrator();
const page = new Page('home-page', orchestrator);

// Enable transition overlay
page.useTransitionOverlay({
  backgroundColor: '#000',
  fadeInDuration: 200,
  holdDuration: 100,
  fadeOutDuration: 200,
  zIndex: 100,
});

// Use it directly from the page
await page.transitionWithOverlay(() => {
  setGlobalState('language', 'en');
  setGlobalState('theme', 'dark');
});
```

---

### Example 2: Component Request via Standalone Utility

```typescript
import { 
  Component, 
  transitionWithOverlay,
  setGlobalState 
} from '@hawsen-the-first/interactiv';

class LanguageSwitch extends Component {
  private async switchLanguage(newLanguage: string): Promise<void> {
    // Request transition from anywhere in the component tree
    await transitionWithOverlay(this.orchestrator, () => {
      setGlobalState('language', newLanguage);
    });
  }
}
```

---

### Example 3: Component Request via Event Bus

```typescript
import { Component, setGlobalState } from '@hawsen-the-first/interactiv';

class LocationButton extends Component {
  private handleClick(): void {
    const transitionBus = this.orchestrator.getEventBus("page-transition-overlay");
    
    if (transitionBus) {
      transitionBus.emit("request-transition", {
        stateChanges: [
          { key: 'currentLocationId', value: 'kororareka' }
        ],
        afterStateChange: () => {
          // Navigate after state is updated
          this.orchestrator.navigateToView('location-detail-view');
        }
      });
    } else {
      // Fallback: no overlay available
      setGlobalState('currentLocationId', 'kororareka');
      this.orchestrator.navigateToView('location-detail-view');
    }
  }
}
```

---

### Example 4: Multiple State Changes with Navigation

```typescript
import { transitionWithOverlay, setGlobalState } from '@hawsen-the-first/interactiv';

async function navigateToRegion(region: string, viewId: string) {
  await transitionWithOverlay(orchestrator, async () => {
    // All state changes happen while overlay is opaque
    setGlobalState('region', region);
    setGlobalState('currentLocationId', null);
    setGlobalState('selectedContent', null);
    
    // Navigation also happens while hidden
    orchestrator.navigateToView(viewId);
  });
}
```

---

## Performance Considerations (BrightSign)

The implementation is optimized for low-powered ARM devices:

- **CSS transitions only** — No JavaScript animation loops
- **`will-change: opacity`** — Hints browser to optimize GPU compositing
- **Single DOM element** — Created once, reused (opacity toggled, not DOM add/remove)
- **No forced reflows** — Minimal DOM reads during transitions
- **`pointer-events: none`** during idle/fade-out — Doesn't block interaction when not active

---

## Migration Guide

**Before (manual overlay in consumer app):**

```typescript
// Consumer's Page template
const template = `
  <div class="page">
    <div class="manual-overlay"></div>
    <!-- content -->
  </div>
`;

// Consumer's CSS
.manual-overlay {
  opacity: 0;
  transition: opacity 200ms;
}
.manual-overlay.active {
  opacity: 1;
}

// Consumer's code
overlay.classList.add('active');
setTimeout(() => {
  setGlobalState('language', 'en');
  setTimeout(() => {
    overlay.classList.remove('active');
  }, 200);
}, 200);
```

**After (framework-level overlay):**

```typescript
// Consumer's setup
page.useTransitionOverlay({
  fadeInDuration: 200,
  fadeOutDuration: 200,
});

// Consumer's code
await page.transitionWithOverlay(() => {
  setGlobalState('language', 'en');
});
// Done! Framework handles timing automatically
```

---

## Troubleshooting

### Overlay not visible

**Issue:** Overlay exists but doesn't cover content.

**Solution:** Ensure the page container has `position: relative` or `position: absolute`. The overlay uses `position: absolute; inset: 0` and requires a positioned parent.

---

### Multiple overlays appearing

**Issue:** Multiple pages have overlays enabled and they stack.

**Solution:** Only enable overlay on **active pages**. The NavigationManager only uses the current page's overlay.

---

### Transition feels slow

**Issue:** Total transition time is too long.

**Solution:** Reduce durations:
```typescript
page.useTransitionOverlay({
  fadeInDuration: 150,  // was 200
  holdDuration: 50,     // was 100
  fadeOutDuration: 150, // was 200
});
```

---

### State changes visible during transition

**Issue:** Content changes are briefly visible.

**Solution:** This indicates the callback is executing before the overlay reaches full opacity. File a bug report — this shouldn't happen due to the `transitionend` event handling.

---

## TypeScript Types

```typescript
interface TransitionOverlayConfig {
  backgroundColor?: string;   // default: '#000'
  fadeInDuration?: number;     // default: 200 (ms)
  holdDuration?: number;       // default: 100 (ms)
  fadeOutDuration?: number;    // default: 200 (ms)
  zIndex?: number;             // default: 100
}

interface TransitionRequestPayload {
  stateChanges?: Array<{ key: string; value: any }>;
  afterStateChange?: () => void | Promise<void>;
  fadeInDuration?: number;   // per-request override
  holdDuration?: number;     // per-request override
  fadeOutDuration?: number;  // per-request override
}
```

---

## FAQ

**Q: Can I use multiple overlays on the same page?**

A: No. Each page has at most one overlay. Call `useTransitionOverlay()` only once per page.

---

**Q: Does the overlay work with page navigation?**

A: The overlay is designed for **view navigation within a page**. Page-to-page navigation uses the existing NavigationManager transition system.

---

**Q: What happens if I call `transitionWithOverlay` but no overlay exists?**

A: The callback executes immediately without any visual transition. This provides a graceful fallback.

---

**Q: Can I change the overlay config after initialization?**

A: Yes, but not via public API currently. The `TransitionOverlay` class has an `updateConfig()` method, but it's not exposed through the Page. File a feature request if needed.

---

**Q: Does this work with the screensaver/settings systems?**

A: Yes! Screensaver and settings pages can enable overlays independently. Each page manages its own overlay.

---

## License

This feature is part of the `@hawsen-the-first/interactiv` framework.
