# Memory Management & Garbage Collection

This document describes the memory leak fixes implemented in the Interactiv framework and how to use the garbage collection system to maintain optimal performance during long-running sessions (especially on BrightSign devices).

## Critical Memory Leaks Fixed

### 1. Animation Manager Memory Leak (CRITICAL)
**Problem:** Animation records accumulated indefinitely without cleanup, causing significant memory bloat over time.

**Fix:**
- Added automatic cleanup listeners to remove animation records when animations finish or are cancelled
- Added `cleanupStaleAnimations()` method as a safety net for animations that don't fire events
- Added `getActiveAnimationCount()` to monitor active animations

**Impact:** Prevents unbounded memory growth from animations that are never cleaned up.

---

### 2. EventBus Listener Management (CRITICAL)
**Problem:** 
- Event listeners accumulated without proper cleanup
- The `remove()` method only removed the first match
- `activeListeners` array grew indefinitely

**Fix:**
- Fixed `remove()` to properly remove all listeners of a given type and clean up the array
- Added `removeAll()` method to clean up all listeners at once
- Added `destroy()` method for proper EventBus cleanup
- Added `getListenerCount()` to monitor listener accumulation

**Impact:** Prevents listener stacking and ensures proper cleanup when components are destroyed.

---

### 3. Event Queue Expiry Handling (CRITICAL)
**Problem:** Events with expiry times were never removed from the queue, causing unbounded growth.

**Fix:**
- Modified `getPrioritisedEventFromQueue()` to filter out expired events
- Added `cleanupExpiredEvents()` method for manual cleanup
- Added diagnostic methods: `getQueueSize()`, `getEventBusCount()`, `getTotalListenerCount()`

**Impact:** Prevents the event queue from growing indefinitely with expired events.

---

### 4. Navigation Transition Leaks (HIGH)
**Problem:**
- `transitionend` event listeners might not fire (interrupted transitions, browser quirks)
- Fallback `setTimeout` callbacks weren't properly tracked or cleared
- Created orphaned listeners that never got removed

**Fix:**
- Properly track both `transitionend` listeners and fallback timers
- Ensure cleanup happens when either fires (prevents double cleanup)
- Store cleanup functions in `activeTransitionCleanups` map
- Added `cleanupOrphanedTransitions()` method as a safety net
- Added `getActiveTransitionCount()` to monitor active transitions

**Impact:** Prevents accumulation of orphaned transition listeners, especially during rapid navigation.

---

### 5. Component Re-render Listener Duplication (MEDIUM)
**Problem:** EventManager already had good deduplication, but components calling `attachEventListeners()` on every render could cause issues.

**Status:** EventManager's `point()` and `hover()` methods already have deduplication logic that checks if elements have changed before re-attaching listeners. This is mostly mitigated but worth monitoring.

---

## Garbage Collector

The `GarbageCollector` class provides automated cleanup of memory leaks across the entire application.

### Basic Usage

```typescript
import { createGarbageCollector } from 'interactiv';

// After initializing your app
const orchestrator = createOrchestrator();
const animationManager = useAnimations(orchestrator);
const navigationManager = new NavigationManager(orchestrator);

// Create garbage collector with auto-start (runs every 5 minutes by default)
const gc = createGarbageCollector(
  orchestrator,
  animationManager,
  navigationManager,
  true,  // autoStart
  5      // interval in minutes
);

// Manual cleanup
gc.runCleanup();

// Get statistics
const stats = gc.getLatestStats();
console.log('Active animations:', stats?.activeAnimations);
console.log('Total listeners:', stats?.totalListeners);
console.log('Queue size:', stats?.queueSize);

// Get memory report
const report = gc.getMemoryReport();
console.log('Average animations:', report.averageAnimations);
console.log('Total items cleaned:', report.totalItemsCleaned);

// Stop auto cleanup
gc.stopAutoCleanup();

// Clean up when done
gc.destroy();
```

### Advanced Configuration

#### Custom Cleanup Interval

```typescript
// Run garbage collection every 10 minutes
const gc = createGarbageCollector(
  orchestrator,
  animationManager,
  navigationManager,
  true,
  10
);
```

#### Manual Control

```typescript
// Don't auto-start, run manually
const gc = createGarbageCollector(
  orchestrator,
  animationManager,
  navigationManager,
  false
);

// Trigger cleanup on specific events
someEventBus.on('user-interaction-ended', () => {
  gc.runCleanup();
});
```

#### Monitoring Memory Usage

```typescript
// Set up periodic monitoring
setInterval(() => {
  const stats = gc.getLatestStats();
  if (stats) {
    console.log('Memory Stats:', {
      animations: stats.activeAnimations,
      listeners: stats.totalListeners,
      queue: stats.queueSize,
      transitions: stats.activeTransitions
    });
    
    // Alert if thresholds exceeded
    if (stats.totalListeners > 1000) {
      console.warn('High listener count detected:', stats.totalListeners);
    }
    
    if (stats.queueSize > 100) {
      console.warn('Large event queue detected:', stats.queueSize);
    }
  }
}, 60000); // Check every minute
```

### Garbage Collection Stats

The `GarbageCollectionStats` interface provides detailed information about each cleanup run:

```typescript
interface GarbageCollectionStats {
  timestamp: number;               // When the cleanup ran
  animationsCleaned: number;       // Stale animations removed
  expiredEventsCleaned: number;    // Expired events removed from queue
  orphanedTransitionsCleaned: number; // Orphaned transition listeners cleaned
  totalListeners: number;          // Current total listener count
  queueSize: number;              // Current event queue size
  activeAnimations: number;       // Current active animation count
  activeTransitions: number;      // Current active transition count
}
```

## Best Practices for BrightSign

### 1. Enable Automatic Garbage Collection

For BrightSign installations that run 24/7, enable automatic garbage collection:

```typescript
const gc = createGarbageCollector(
  orchestrator,
  animationManager,
  navigationManager,
  true,
  5  // Every 5 minutes
);
```

### 2. Monitor Memory Trends

Set up logging to track memory trends over time:

```typescript
setInterval(() => {
  const report = gc.getMemoryReport();
  console.log('Memory Report:', report);
  
  // Log to external monitoring if needed
  sendToMonitoring({
    type: 'memory-stats',
    ...report
  });
}, 300000); // Every 5 minutes
```

### 3. Trigger Cleanup on Key Events

Trigger manual cleanup during natural breaks in interaction:

```typescript
// After screensaver activates
screensaverBus.on('screensaver-activated', () => {
  gc.runCleanup();
});

// After returning from screensaver
screensaverBus.on('screensaver-deactivated', () => {
  gc.runCleanup();
});

// After major navigation
navigationBus.on('page-changed', () => {
  // Optional: cleanup after page changes
  gc.runCleanup();
});
```

### 4. Component Lifecycle Management

Ensure components are properly destroyed when removed:

```typescript
// When removing components
view.removeComponent(componentId);
component.destroy(); // Calls EventManager.destroy() and StateManager.destroy()
```

### 5. Avoid Event Listener Stacking

When using the EventManager in components:

```typescript
class MyComponent extends Component {
  onAfterRender() {
    // EventManager already handles deduplication
    // These won't create duplicate listeners if called multiple times
    this.point('.button', (data) => {
      console.log('Button clicked');
    });
  }
}
```

## Diagnostic Methods

### EventOrchestrator
```typescript
orchestrator.getQueueSize();           // Current event queue size
orchestrator.getEventBusCount();       // Number of registered event buses
orchestrator.getTotalListenerCount();  // Total listeners across all buses
orchestrator.cleanupExpiredEvents();   // Manually clean expired events
```

### EventBus
```typescript
eventBus.getListenerCount();  // Number of listeners on this bus
eventBus.removeAll();         // Remove all listeners
eventBus.destroy();          // Full cleanup
```

### AnimationManager
```typescript
animationManager.getActiveAnimationCount();  // Current active animations
animationManager.cleanupStaleAnimations();   // Clean stale animations
```

### NavigationManager
```typescript
navigationManager.getActiveTransitionCount();  // Current active transitions
navigationManager.cleanupOrphanedTransitions(); // Clean orphaned transitions
```

## Performance Impact

The garbage collector is designed to have minimal performance impact:

- **Cleanup Duration**: Typically < 10ms per run
- **Memory Impact**: Removes accumulated garbage without affecting active resources
- **CPU Impact**: Negligible - runs infrequently and only processes stale resources

## Troubleshooting

### High Listener Count

If you see consistently high listener counts:

1. Check for components that aren't being properly destroyed
2. Ensure `component.destroy()` is called when removing components
3. Verify navigation transitions are completing properly

### Growing Event Queue

If the event queue keeps growing:

1. Check for events with very long delays
2. Ensure events have reasonable expiry times when appropriate
3. Consider more frequent garbage collection

### Memory Still Growing

If memory continues to grow despite garbage collection:

1. Check for DOM nodes that aren't being removed
2. Look for closure-based memory leaks in custom component code
3. Use browser DevTools memory profiling to identify leaks
4. Ensure all intervals/timeouts are cleared when components are destroyed

## Migration Guide

If you have existing code, here's how to integrate the memory management improvements:

### Step 1: Update Your Initialization

```typescript
// Before
const orchestrator = createOrchestrator();
const animationManager = useAnimations(orchestrator);

// After - add garbage collection
const orchestrator = createOrchestrator();
const animationManager = useAnimations(orchestrator);
const navigationManager = new NavigationManager(orchestrator);

const gc = createGarbageCollector(
  orchestrator,
  animationManager,
  navigationManager,
  true,  // auto-start
  5      // 5 minutes interval
);
```

### Step 2: Add Monitoring (Optional but Recommended)

```typescript
// Log memory stats periodically
setInterval(() => {
  const stats = gc.getLatestStats();
  if (stats) {
    console.log('Memory Stats:', {
      animations: stats.activeAnimations,
      listeners: stats.totalListeners,
      queue: stats.queueSize,
    });
  }
}, 60000); // Every minute
```

### Step 3: No Code Changes Required

All the memory leak fixes are automatic. Your existing code will benefit immediately from:
- Automatic animation cleanup
- Proper event listener cleanup
- Event queue expiry handling
- Navigation transition cleanup

## Conclusion

These memory management improvements address the critical memory leaks that were causing performance degradation in long-running interactive installations. The garbage collector provides an additional safety net and monitoring capabilities to ensure stable performance over extended periods.

For BrightSign installations, we recommend:
- Enable automatic garbage collection (5-minute intervals)
- Monitor memory trends
- Trigger manual cleanup during natural interaction breaks
- Ensure proper component lifecycle management
