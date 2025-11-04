import { EventBus, EventOrchestrator } from "./eventBus";
import { View } from "./appBuilder";
import { NavigationManager, type TransitionConfig } from "./navigationManager";
import { stateManager } from "./stateManager";
import { Logger } from "../utils/logger";

const log = new Logger();

export interface SettingsConfig {
  view: View;
  transitionConfig?: TransitionConfig;
  exitBehavior?: "reset" | "return"; // Default: 'reset'
  startingViewId?: string; // Required when exitBehavior is 'reset'
  cornerTouchRadius?: number; // Size of corner touch zones in pixels (default: 100)
  touchTimeout?: number; // Max time between touches in ms (default: 3000)
  debugMode?: boolean; // Show visual feedback for touch zones
}

interface TouchSequenceState {
  step: number; // 0 = waiting for top-left, 1 = waiting for top-right, 2 = waiting for bottom-right
  lastTouchTime: number;
}

export class SettingsManager {
  private eventBus: EventBus;
  private orchestrator: EventOrchestrator;
  private navigationManager: NavigationManager;
  private config: SettingsConfig | null = null;
  private isSettingsActive: boolean = false;
  private lastActiveViewId: string | null = null;
  private touchSequenceState: TouchSequenceState = {
    step: 0,
    lastTouchTime: 0,
  };
  private lastEventTime: number = 0; // Track last event to prevent duplicates
  private touchListeners: Array<{
    element: EventTarget;
    type: string;
    listener: EventListener;
  }> = [];

  // Default configuration values
  private readonly DEFAULT_CORNER_RADIUS = 100;
  private readonly DEFAULT_TOUCH_TIMEOUT = 3000;
  private readonly EVENT_DEBOUNCE_MS = 50; // Ignore events within 50ms of each other

  constructor(orchestrator: EventOrchestrator, navigationManager: NavigationManager) {
    this.orchestrator = orchestrator;
    this.navigationManager = navigationManager;
    this.eventBus = orchestrator.registerEventBus("settings-manager");

    this.setupEventListeners();
    this.initializeGlobalState();
  }

  private initializeGlobalState(): void {
    if (!stateManager.has("settings.isActive")) {
      stateManager.set("settings.isActive", false);
    }
    if (!stateManager.has("settings.lastActiveViewId")) {
      stateManager.set("settings.lastActiveViewId", null);
    }
  }

  private setupEventListeners(): void {
    this.eventBus.on("register-settings", (e) => {
      const { config } = e.detail;
      this.registerSettings(config);
    });

    this.eventBus.on("activate-settings", () => {
      this.activateSettings();
    });

    this.eventBus.on("deactivate-settings", () => {
      this.deactivateSettings();
    });

    // Listen for navigation changes to track active views
    const navBus = this.orchestrator.getEventBus("navigation-manager");
    if (navBus) {
      navBus.on("view-changed", (e) => {
        const { newViewId } = e.detail;
        if (!this.isSettingsActive && newViewId !== this.config?.view.componentId) {
          this.lastActiveViewId = newViewId;
          stateManager.set("settings.lastActiveViewId", newViewId);
        }
      });
    }
  }

  public registerSettings(config: SettingsConfig): void {
    this.validateConfig(config);

    // Clean up existing settings if any
    if (this.config) {
      this.cleanup();
    }

    this.config = {
      ...config,
      exitBehavior: config.exitBehavior || "reset",
      cornerTouchRadius: config.cornerTouchRadius || this.DEFAULT_CORNER_RADIUS,
      touchTimeout: config.touchTimeout || this.DEFAULT_TOUCH_TIMEOUT,
      debugMode: config.debugMode || false,
      transitionConfig: config.transitionConfig || {
        type: "fade",
        duration: 500,
      },
    };

    // Register the settings view with navigation manager
    const navBus = this.orchestrator.getEventBus("navigation-manager");
    if (navBus) {
      navBus.emit("register-view", { view: this.config.view });
    }

    this.setupCornerTouchListeners();
    this.resetTouchSequence();

    log.trace(
      `Settings registered with corner touch activation (radius: ${this.config.cornerTouchRadius}px, timeout: ${this.config.touchTimeout}ms)`
    );
  }

  private validateConfig(config: SettingsConfig): void {
    if (!config.view) {
      throw new Error("Settings view is required");
    }

    if (config.exitBehavior === "reset" && !config.startingViewId) {
      throw new Error('startingViewId is required when exitBehavior is "reset"');
    }

    if (config.exitBehavior && !["reset", "return"].includes(config.exitBehavior)) {
      throw new Error('exitBehavior must be either "reset" or "return"');
    }

    if (config.cornerTouchRadius && config.cornerTouchRadius <= 0) {
      throw new Error("cornerTouchRadius must be greater than 0");
    }

    if (config.touchTimeout && config.touchTimeout <= 0) {
      throw new Error("touchTimeout must be greater than 0");
    }
  }

  private setupCornerTouchListeners(): void {
    if (!this.config) return;

    const touchHandler = (event: Event) => {
      if (event instanceof TouchEvent || event instanceof MouseEvent) {
        this.handleTouchAttempt(event);
      }
    };

    // Add listeners for both touch and mouse events
    const eventTypes = ["touchstart"];

    eventTypes.forEach((eventType) => {
      const listener = touchHandler.bind(this) as EventListener;
      document.addEventListener(eventType, listener, { passive: true });

      this.touchListeners.push({
        element: document,
        type: eventType,
        listener,
      });
    });
  }

  private handleTouchAttempt(event: TouchEvent | MouseEvent): void {
    if (!this.config) return;

    const now = Date.now();

    // Prevent duplicate events (touchstart + mousedown on same interaction)
    if (now - this.lastEventTime < this.EVENT_DEBOUNCE_MS) {
      log.trace("Ignoring duplicate event within debounce window");
      return;
    }
    this.lastEventTime = now;

    // Get touch/click coordinates
    let x: number, y: number;
    if (event instanceof TouchEvent && event.touches.length > 0) {
      x = event.touches[0].clientX;
      y = event.touches[0].clientY;
    } else if (event instanceof MouseEvent) {
      x = event.clientX;
      y = event.clientY;
    } else {
      return;
    }
    const timeSinceLastTouch = now - this.touchSequenceState.lastTouchTime;

    // Check if timeout exceeded
    if (this.touchSequenceState.step > 0 && timeSinceLastTouch > this.config.touchTimeout!) {
      log.trace("Touch sequence timed out, resetting");
      this.resetTouchSequence();
    }

    const cornerDetected = this.detectCornerTouch(x, y);

    if (cornerDetected === null) {
      // Touch outside corner zones - reset sequence
      if (this.touchSequenceState.step > 0) {
        log.trace("Touch outside corner zones, resetting sequence");
        this.resetTouchSequence();
      }
      return;
    }

    // Check if the correct corner was touched based on current step
    const expectedCorner = this.getExpectedCorner();

    if (cornerDetected === expectedCorner) {
      log.trace(`Correct corner touched: ${cornerDetected} (step ${this.touchSequenceState.step + 1}/3)`);
      this.touchSequenceState.step++;
      this.touchSequenceState.lastTouchTime = now;

      // Check if sequence is complete
      if (this.touchSequenceState.step === 3) {
        log.trace("Touch sequence complete! Activating settings...");
        this.activateSettings();
        this.resetTouchSequence();
      }
    } else {
      // Wrong corner touched - reset sequence
      log.trace(`Wrong corner touched: expected ${expectedCorner}, got ${cornerDetected}. Resetting sequence.`);
      this.resetTouchSequence();
    }
  }

  private detectCornerTouch(x: number, y: number): "top-left" | "top-right" | "bottom-right" | null {
    if (!this.config) return null;

    const radius = this.config.cornerTouchRadius!;
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Top-left corner
    if (x < radius && y < radius) {
      log.trace("top-left touch", [x, y, radius]);
      return "top-left";
    }

    // Top-right corner
    if (x > width - radius && y < radius) {
      log.trace("top-right touch");
      return "top-right";
    }

    // Bottom-right corner
    if (x > width - radius && y > height - radius) {
      log.trace("bottom-right touch");
      return "bottom-right";
    }

    return null;
  }

  private getExpectedCorner(): "top-left" | "top-right" | "bottom-right" {
    switch (this.touchSequenceState.step) {
      case 0:
        return "top-left";
      case 1:
        return "top-right";
      case 2:
        return "bottom-right";
      default:
        return "top-left";
    }
  }

  private resetTouchSequence(): void {
    this.touchSequenceState = {
      step: 0,
      lastTouchTime: 0,
    };
    this.lastEventTime = 0; // Reset debounce timer as well
  }

  private async activateSettings(): Promise<void> {
    if (!this.config || this.isSettingsActive) return;

    log.trace("Activating settings");

    // Store the current view before switching to settings
    const currentViewId = this.navigationManager.getCurrentViewId();
    if (currentViewId && currentViewId !== this.config.view.componentId) {
      this.lastActiveViewId = currentViewId;
      stateManager.set("settings.lastActiveViewId", currentViewId);
    }

    this.isSettingsActive = true;
    stateManager.set("settings.isActive", true);

    try {
      await this.navigationManager.navigateToView(this.config.view.componentId, this.config.transitionConfig);

      this.eventBus.emit("settings-activated", {
        viewId: this.config.view.componentId,
        previousViewId: this.lastActiveViewId,
      });
    } catch (error) {
      log.error("Failed to activate settings:", error as Error);
      this.isSettingsActive = false;
      stateManager.set("settings.isActive", false);
    }
  }

  private async handleSettingsExit(): Promise<void> {
    if (!this.config || !this.isSettingsActive) return;

    log.trace(`Exiting settings with '${this.config.exitBehavior}' behavior`);

    this.isSettingsActive = false;
    stateManager.set("settings.isActive", false);

    let targetViewId: string | null = null;

    if (this.config.exitBehavior === "return" && this.lastActiveViewId) {
      targetViewId = this.lastActiveViewId;
    } else if (this.config.exitBehavior === "reset" && this.config.startingViewId) {
      targetViewId = this.config.startingViewId;
    }

    if (targetViewId) {
      try {
        await this.navigationManager.navigateToView(targetViewId, this.config.transitionConfig);

        this.eventBus.emit("settings-deactivated", {
          targetViewId,
          exitBehavior: this.config.exitBehavior,
        });
      } catch (error) {
        log.error("Failed to exit settings:", error as Error);
        // Reset state on error
        this.isSettingsActive = true;
        stateManager.set("settings.isActive", true);
      }
    } else {
      log.warn("No target view available for settings exit");
    }
  }

  private async deactivateSettings(): Promise<void> {
    await this.handleSettingsExit();
  }

  public isActive(): boolean {
    return this.isSettingsActive;
  }

  public getCurrentConfig(): SettingsConfig | null {
    return this.config;
  }

  public getLastActiveViewId(): string | null {
    return this.lastActiveViewId;
  }

  // Manual control methods
  public forceActivate(): void {
    this.resetTouchSequence();
    this.activateSettings();
  }

  public forceDeactivate(): void {
    this.deactivateSettings();
  }

  public resetSequence(): void {
    this.resetTouchSequence();
  }

  private cleanup(): void {
    // Remove all touch listeners
    this.touchListeners.forEach(({ element, type, listener }) => {
      element.removeEventListener(type, listener);
    });
    this.touchListeners.length = 0;

    this.isSettingsActive = false;
    stateManager.set("settings.isActive", false);
    this.resetTouchSequence();
  }

  public destroy(): void {
    this.cleanup();
    this.config = null;
    this.lastActiveViewId = null;
    log.trace("SettingsManager destroyed");
  }
}
