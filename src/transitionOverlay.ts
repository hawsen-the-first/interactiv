import { EventOrchestrator } from "./eventBus";
import { setGlobalState } from "./stateManager";
import { logger } from "./logger";

const log = logger;

export interface TransitionOverlayConfig {
  backgroundColor?: string;   // default: '#000'
  fadeInDuration?: number;     // default: 200 (ms)
  holdDuration?: number;       // default: 100 (ms)
  fadeOutDuration?: number;    // default: 200 (ms)
  zIndex?: number;             // default: 100
}

export interface TransitionRequestPayload {
  stateChanges?: Array<{ key: string; value: any }>;
  afterStateChange?: () => void | Promise<void>;
  fadeInDuration?: number;   // per-request override
  holdDuration?: number;     // per-request override
  fadeOutDuration?: number;  // per-request override
}

type QueuedTransitionRequest = {
  callback: () => void | Promise<void>;
  config: Required<TransitionOverlayConfig>;
  resolve: () => void;
  reject: (error: Error) => void;
};

type TransitionPhase = "idle" | "fade-in" | "hold" | "fade-out";

/**
 * TransitionOverlay - Manages visual overlay transitions for seamless content updates
 * 
 * This class provides a fade-to-opaque overlay that hides content changes during state updates.
 * 
 * **Concurrency Strategy:**
 * - If a transition is in the **fade-in or hold phase**, incoming requests queue their callbacks 
 *   to be batched into the current cycle's hold phase
 * - If a transition is in the **fade-out phase**, incoming requests start a new transition cycle 
 *   after the current one completes
 * 
 * This ensures smooth transitions without jarring interruptions or visible content changes.
 */
export class TransitionOverlay {
  private config: Required<TransitionOverlayConfig>;
  private shadowRoot: ShadowRoot;
  private overlayElement: HTMLDivElement | null = null;
  private currentPhase: TransitionPhase = "idle";
  private queuedCallbacks: Array<() => void | Promise<void>> = [];
  private queuedRequests: QueuedTransitionRequest[] = [];
  private activeTransitionPromise: Promise<void> | null = null;

  constructor(config: TransitionOverlayConfig, shadowRoot: ShadowRoot) {
    this.config = {
      backgroundColor: config.backgroundColor ?? "#000",
      fadeInDuration: config.fadeInDuration ?? 200,
      holdDuration: config.holdDuration ?? 100,
      fadeOutDuration: config.fadeOutDuration ?? 200,
      zIndex: config.zIndex ?? 100,
    };
    this.shadowRoot = shadowRoot;
    this.injectOverlayElement();
  }

  private injectOverlayElement(): void {
    this.overlayElement = document.createElement("div");
    this.overlayElement.className = "transition-overlay";
    this.overlayElement.style.cssText = `
      position: absolute;
      inset: 0;
      background-color: ${this.config.backgroundColor};
      opacity: 0;
      pointer-events: none;
      z-index: ${this.config.zIndex};
      will-change: opacity;
      transition: opacity ${this.config.fadeInDuration}ms ease-in-out;
    `;

    // Append to the shadow root or to .page if it exists
    const pageElement = this.shadowRoot.querySelector(".page");
    const container = pageElement || this.shadowRoot;
    
    // Ensure the container has relative positioning for absolute overlay
    if (container instanceof HTMLElement) {
      const currentPosition = window.getComputedStyle(container).position;
      if (currentPosition === "static") {
        container.style.position = "relative";
      }
    }
    
    container.appendChild(this.overlayElement);
    log.trace("TransitionOverlay element injected into shadow DOM");
  }

  /**
   * Execute a transition with the overlay lifecycle
   * 
   * @param callback - Function to execute while overlay is opaque (state changes happen here)
   * @param configOverrides - Optional per-request config overrides
   * @returns Promise that resolves after the full transition completes
   */
  public async executeTransition(
    callback: () => void | Promise<void>,
    configOverrides?: Partial<TransitionOverlayConfig>
  ): Promise<void> {
    // Merge config overrides
    const effectiveConfig: Required<TransitionOverlayConfig> = {
      ...this.config,
      ...configOverrides,
    };

    // Handle concurrency
    if (this.currentPhase !== "idle") {
      return this.handleConcurrentRequest(callback, effectiveConfig);
    }

    // Start new transition
    this.activeTransitionPromise = this.performTransition(callback, effectiveConfig);
    return this.activeTransitionPromise;
  }

  private handleConcurrentRequest(
    callback: () => void | Promise<void>,
    config: Required<TransitionOverlayConfig>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // If we're in fade-in or hold, batch this callback into the current cycle
      if (this.currentPhase === "fade-in" || this.currentPhase === "hold") {
        log.trace("Batching callback into current transition cycle", { 
          currentPhase: this.currentPhase 
        });
        this.queuedCallbacks.push(callback);
        // Resolve when the current transition completes
        this.activeTransitionPromise?.then(resolve).catch(reject);
      } 
      // If we're in fade-out, queue for the next cycle
      else if (this.currentPhase === "fade-out") {
        log.trace("Queueing request for next transition cycle", { 
          currentPhase: this.currentPhase 
        });
        this.queuedRequests.push({ callback, config, resolve, reject });
      }
    });
  }

  private async performTransition(
    callback: () => void | Promise<void>,
    config: Required<TransitionOverlayConfig>
  ): Promise<void> {
    if (!this.overlayElement) {
      throw new Error("Overlay element not initialized");
    }

    try {
      // Phase 1: Fade in
      this.currentPhase = "fade-in";
      await this.fadeIn(config.fadeInDuration);

      // Phase 2: Hold & execute callbacks
      this.currentPhase = "hold";
      await this.executeCallbacks(callback, config.holdDuration);

      // Phase 3: Fade out
      this.currentPhase = "fade-out";
      await this.fadeOut(config.fadeOutDuration);

      // Back to idle
      this.currentPhase = "idle";

      // Process any queued requests
      this.processQueuedRequests();

    } catch (error) {
      log.error("Transition error:", error as Error);
      this.currentPhase = "idle";
      this.queuedCallbacks = [];
      throw error;
    }
  }

  private fadeIn(duration: number): Promise<void> {
    if (!this.overlayElement) return Promise.resolve();

    return new Promise((resolve) => {
      const element = this.overlayElement!;
      
      // Update transition duration
      element.style.transition = `opacity ${duration}ms ease-in-out`;
      
      // Enable pointer events to block interaction
      element.style.pointerEvents = "all";

      let transitionEndFired = false;
      let fallbackTimerId: number | null = null;

      const cleanup = () => {
        if (transitionEndFired) return;
        transitionEndFired = true;
        
        element.removeEventListener("transitionend", transitionEndHandler);
        if (fallbackTimerId !== null) {
          clearTimeout(fallbackTimerId);
          fallbackTimerId = null;
        }
        
        log.trace("Overlay fade-in complete");
        resolve();
      };

      const transitionEndHandler = (e: TransitionEvent) => {
        // Only respond to opacity transitions on this element
        if (e.target === element && e.propertyName === "opacity") {
          cleanup();
        }
      };

      element.addEventListener("transitionend", transitionEndHandler);

      // Trigger fade-in by setting opacity to 1
      // Use requestAnimationFrame to ensure CSS transition is applied
      requestAnimationFrame(() => {
        element.style.opacity = "1";
      });

      // Fallback timeout
      fallbackTimerId = window.setTimeout(() => {
        log.trace("Overlay fade-in fallback timeout triggered");
        cleanup();
      }, duration + 50);
    });
  }

  private async executeCallbacks(
    callback: () => void | Promise<void>,
    holdDuration: number
  ): Promise<void> {
    // Execute the main callback
    await Promise.resolve(callback());

    // Execute any batched callbacks
    if (this.queuedCallbacks.length > 0) {
      log.trace(`Executing ${this.queuedCallbacks.length} batched callbacks`);
      for (const queuedCallback of this.queuedCallbacks) {
        await Promise.resolve(queuedCallback());
      }
      this.queuedCallbacks = [];
    }

    // Hold duration
    if (holdDuration > 0) {
      await new Promise(resolve => setTimeout(resolve, holdDuration));
    }
  }

  private fadeOut(duration: number): Promise<void> {
    if (!this.overlayElement) return Promise.resolve();

    return new Promise((resolve) => {
      const element = this.overlayElement!;
      
      // Update transition duration
      element.style.transition = `opacity ${duration}ms ease-in-out`;

      let transitionEndFired = false;
      let fallbackTimerId: number | null = null;

      const cleanup = () => {
        if (transitionEndFired) return;
        transitionEndFired = true;
        
        element.removeEventListener("transitionend", transitionEndHandler);
        if (fallbackTimerId !== null) {
          clearTimeout(fallbackTimerId);
          fallbackTimerId = null;
        }
        
        // Disable pointer events after fade-out
        element.style.pointerEvents = "none";
        
        log.trace("Overlay fade-out complete");
        resolve();
      };

      const transitionEndHandler = (e: TransitionEvent) => {
        // Only respond to opacity transitions on this element
        if (e.target === element && e.propertyName === "opacity") {
          cleanup();
        }
      };

      element.addEventListener("transitionend", transitionEndHandler);

      // Trigger fade-out by setting opacity to 0
      requestAnimationFrame(() => {
        element.style.opacity = "0";
      });

      // Fallback timeout
      fallbackTimerId = window.setTimeout(() => {
        log.trace("Overlay fade-out fallback timeout triggered");
        cleanup();
      }, duration + 50);
    });
  }

  private processQueuedRequests(): void {
    if (this.queuedRequests.length > 0) {
      log.trace(`Processing ${this.queuedRequests.length} queued transition requests`);
      const request = this.queuedRequests.shift()!;
      
      this.performTransition(request.callback, request.config)
        .then(request.resolve)
        .catch(request.reject);
    }
  }

  /**
   * Update the overlay configuration
   */
  public updateConfig(config: Partial<TransitionOverlayConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };

    if (this.overlayElement) {
      if (config.backgroundColor) {
        this.overlayElement.style.backgroundColor = config.backgroundColor;
      }
      if (config.zIndex !== undefined) {
        this.overlayElement.style.zIndex = String(config.zIndex);
      }
    }
  }

  /**
   * Get the current transition phase
   */
  public getPhase(): TransitionPhase {
    return this.currentPhase;
  }

  /**
   * Check if a transition is currently active
   */
  public isTransitioning(): boolean {
    return this.currentPhase !== "idle";
  }

  /**
   * Re-attach the overlay element to the shadow DOM after a re-render.
   * Should be called by the Page after updateShadowDOM() runs.
   * 
   * This fixes the issue where updateShadowDOM() replaces the entire shadow DOM innerHTML,
   * destroying the overlay element that was previously appended.
   */
  public reattach(): void {
    if (!this.overlayElement) return;
    
    // Check if the overlay is still in the DOM
    if (this.overlayElement.parentNode) return; // Still attached, nothing to do
    
    // Re-inject into the shadow root
    const pageElement = this.shadowRoot.querySelector(".page");
    const container = pageElement || this.shadowRoot;
    
    // Ensure the container has relative positioning for absolute overlay
    if (container instanceof HTMLElement) {
      const currentPosition = window.getComputedStyle(container).position;
      if (currentPosition === "static") {
        container.style.position = "relative";
      }
    }
    
    container.appendChild(this.overlayElement);
    log.trace("TransitionOverlay re-attached after re-render");
  }

  /**
   * Clean up the overlay element and resources
   */
  public destroy(): void {
    if (this.overlayElement && this.overlayElement.parentNode) {
      this.overlayElement.parentNode.removeChild(this.overlayElement);
    }
    this.overlayElement = null;
    this.queuedCallbacks = [];
    this.queuedRequests = [];
    this.currentPhase = "idle";
    log.trace("TransitionOverlay destroyed");
  }
}

/**
 * Standalone utility for requesting overlay transitions via event bus
 * 
 * This is the recommended way for components to request transitions, as it:
 * 1. Works from anywhere in the component tree
 * 2. Gracefully falls back to direct execution if no overlay is available
 * 3. Supports state changes via the standardized event format
 * 
 * @param orchestrator - The EventOrchestrator instance
 * @param callback - Function to execute during the transition (while overlay is opaque)
 * @param config - Optional per-request config overrides
 * @returns Promise that resolves after the transition completes
 */
export async function transitionWithOverlay(
  orchestrator: EventOrchestrator,
  callback: () => void | Promise<void>,
  config?: Partial<TransitionOverlayConfig>
): Promise<void> {
  const transitionBus = orchestrator.getEventBus("page-transition-overlay");
  
  if (transitionBus) {
    // Wrap in a promise that resolves when the transition completes
    return new Promise((resolve, reject) => {
      try {
        transitionBus.emit("request-transition", {
          callback,
          ...config,
          _resolve: resolve,
          _reject: reject,
        });
      } catch (error) {
        // If the emit fails (no listeners), fall back to direct execution
        log.warn("No transition overlay available, executing callback directly");
        Promise.resolve(callback()).then(resolve).catch(reject);
      }
    });
  } else {
    // Fallback: no overlay available, execute directly
    log.trace("No transition overlay bus found, executing callback directly");
    await Promise.resolve(callback());
  }
}

/**
 * Helper to convert state changes array to callback function
 */
export function stateChangesToCallback(
  stateChanges: Array<{ key: string; value: any }>
): () => void {
  return () => {
    stateChanges.forEach(({ key, value }) => {
      setGlobalState(key, value);
    });
  };
}
