import { EventBus, EventOrchestrator } from "./eventBus";
import { Page, View } from "./appBuilder";
import { stateManager, type StateSubscription } from "./stateManager";
import { logger } from "./logger";

const log = logger;

export interface TransitionConfig {
  type: "slide" | "fade" | "scale" | "flip" | "snap" | "custom";
  direction?: "left" | "right" | "up" | "down";
  duration?: number;
  easing?: string;
  customCSS?: string;
}

export interface NavigationState {
  currentPageId: string | null;
  currentViewId: string | null;
  isTransitioning: boolean;
}

/**
 * NavigationManager - Singleton Service for Application Navigation
 * 
 * **IMPORTANT: Only ONE instance of NavigationManager should exist per application.**
 * 
 * This class manages page and view navigation using shared global state. Multiple instances
 * would cause critical issues:
 * - Conflicting global state (navigation.currentPageId, navigation.currentViewId, navigation.isTransitioning)
 * - Event bus namespace collisions (all instances register as "navigation-manager")
 * - Ambiguous page/view registration and navigation routing
 * 
 * The NavigationManager is automatically instantiated by AppBuilder and should not be
 * manually created elsewhere in the application.
 * 
 * @example
 * // ✅ Correct: Created once by AppBuilder
 * class AppBuilder extends RenderableComponent {
 *   private navigationManager: NavigationManager;
 *   constructor(orchestrator: EventOrchestrator) {
 *     this.navigationManager = new NavigationManager(orchestrator);
 *   }
 * }
 * 
 * // ❌ Wrong: Creating additional instances
 * const nav1 = new NavigationManager(orchestrator); // First instance - OK
 * const nav2 = new NavigationManager(orchestrator); // ERROR: Will throw!
 */
export class NavigationManager {
  private static instance: NavigationManager | null = null;
  private static isDestroyed: boolean = false;
  
  private eventBus: EventBus;
  private orchestrator: EventOrchestrator;
  private pages: Map<string, Page> = new Map();
  private views: Map<string, View> = new Map();
  private stateSubscriptions: StateSubscription[] = [];
  private activeTransitionCleanups: Map<HTMLElement, () => void> = new Map();

  /**
   * Get the singleton instance of NavigationManager
   * Returns null if no instance has been created yet
   */
  public static getInstance(): NavigationManager | null {
    return NavigationManager.instance;
  }

  constructor(orchestrator: EventOrchestrator) {
    // Enforce singleton pattern - only one instance allowed
    if (NavigationManager.instance !== null) {
      const errorMsg = 
        "NavigationManager instance already exists! Only one NavigationManager should be created per application. " +
        "The NavigationManager is automatically created by AppBuilder and should not be instantiated manually.";
      const error = new Error(errorMsg);
      log.error(errorMsg, error);
      throw error;
    }
    
    if (NavigationManager.isDestroyed) {
      log.warn("Creating new NavigationManager instance after previous instance was destroyed.");
      NavigationManager.isDestroyed = false;
    }
    
    // Register this as the singleton instance
    NavigationManager.instance = this;
    log.trace("NavigationManager singleton instance created");
    this.orchestrator = orchestrator;
    this.eventBus = orchestrator.registerEventBus("navigation-manager");

    // Initialize global navigation state
    this.initializeGlobalState();

    this.setupEventListeners();
  }

  private initializeGlobalState(): void {
    // Initialize navigation state in global store if not already present
    if (!stateManager.has("navigation.currentPageId")) {
      stateManager.set("navigation.currentPageId", null);
    }
    if (!stateManager.has("navigation.currentViewId")) {
      stateManager.set("navigation.currentViewId", null);
    }
    if (!stateManager.has("navigation.isTransitioning")) {
      stateManager.set("navigation.isTransitioning", false);
    }
  }

  private setupEventListeners(): void {
    this.eventBus.on("navigate-to-page", (e) => {
      const { pageId, config } = e.detail;
      this.performPageNavigationInternal(pageId, config);
    });

    this.eventBus.on("navigate-to-view", (e) => {
      const { viewId, config } = e.detail;
      this.performViewNavigationInternal(viewId, config);
    });

    this.eventBus.on("register-page", (e) => {
      const { page } = e.detail;
      this.registerPage(page);
    });

    this.eventBus.on("register-view", (e) => {
      const { view } = e.detail;
      this.registerView(view);
    });
  }

  public registerPage(page: Page): void {
    this.pages.set(page.componentId, page);
    this.setupPageContainer(page);

    // If this is the first page, make it active
    if (!stateManager.get("navigation.currentPageId")) {
      stateManager.set("navigation.currentPageId", page.componentId);
      this.showPage(page.componentId);
    } else {
      this.hidePage(page.componentId);
    }
  }

  public registerView(view: View): void {
    this.views.set(view.componentId, view);
    this.setupViewContainer(view);

    // Hide all views by default - they will be shown when navigated to
    this.hideView(view.componentId);
  }

  private setupPageContainer(page: Page): void {
    const hostElement = page.getHostElement();
    hostElement.classList.add("nav-item", "nav-page");
    hostElement.setAttribute("data-page-id", page.componentId);
  }

  private setupViewContainer(view: View): void {
    const hostElement = view.getHostElement();
    hostElement.classList.add("nav-item", "nav-view");
    hostElement.setAttribute("data-view-id", view.componentId);
  }

  public async navigateToPage(
    pageId: string,
    config: TransitionConfig = { type: "snap" },
    priority: string = "immediate"
  ): Promise<void> {
    // Use EventOrchestrator queue for navigation requests
    if (stateManager.get("navigation.isTransitioning")) {
      // Queue the navigation through the orchestrator
      this.orchestrator.enqueue("navigate-to-page", "navigation-manager", priority, { pageId, config });
      return;
    }

    // Direct navigation if not transitioning
    this.orchestrator.enqueue("navigate-to-page", "navigation-manager", priority, { pageId, config });
  }

  public async navigateToView(
    viewId: string,
    config: TransitionConfig = { type: "snap" },
    priority: string = "immediate"
  ): Promise<void> {
    // Use EventOrchestrator queue for navigation requests
    if (stateManager.get("navigation.isTransitioning")) {
      // Queue the navigation through the orchestrator
      this.orchestrator.enqueue("navigate-to-view", "navigation-manager", priority, { viewId, config });
      return;
    }

    // Direct navigation if not transitioning
    this.orchestrator.enqueue("navigate-to-view", "navigation-manager", priority, { viewId, config });
  }

  private async performPageNavigationInternal(pageId: string, config: TransitionConfig): Promise<void> {
    if (!this.pages.has(pageId)) {
      throw new Error(`Page with id "${pageId}" not found`);
    }

    if (stateManager.get("navigation.currentPageId") === pageId) {
      return; // Already on this page
    }

    const previousPageId = stateManager.get("navigation.currentPageId");
    stateManager.set("navigation.isTransitioning", true);

    try {
      await this.performPageTransition(pageId, config);
      stateManager.set("navigation.currentPageId", pageId);
      stateManager.set("navigation.currentViewId", null); // Reset view when changing pages

      // Hide all views when navigating to a page to ensure clean state
      this.hideAllViews();

      this.eventBus.emit("page-changed", {
        newPageId: pageId,
        previousPageId,
      });
    } finally {
      stateManager.set("navigation.isTransitioning", false);
    }
  }

  private async performViewNavigationInternal(viewId: string, config: TransitionConfig): Promise<void> {
    if (!this.views.has(viewId)) {
      throw new Error(`View with id "${viewId}" not found`);
    }

    if (stateManager.get("navigation.currentViewId") === viewId) {
      log.trace(`Already on view ${viewId}, emitting re-entry event`);
      //this.eventBus.emit("view-re-entered", { viewId });
      return; // Already on this view
    }

    const previousViewId = stateManager.get("navigation.currentViewId") as string | null;
    log.trace(`Starting navigation from ${previousViewId} to ${viewId}`);
    stateManager.set("navigation.isTransitioning", true);

    try {
      // Check if current page has a transition overlay
      const currentPageId = stateManager.get("navigation.currentPageId") as string;
      const currentPage = currentPageId ? this.pages.get(currentPageId) : null;
      const hasOverlay = currentPage && currentPage.hasTransitionOverlay();

      if (hasOverlay) {
        // Use the overlay to wrap the view transition
        log.trace(`Using transition overlay for view navigation to ${viewId}`);
        const overlay = currentPage!.getTransitionOverlay()!;
        
        await overlay.executeTransition(async () => {
          // Perform the view swap while overlay is opaque
          await this.performViewSwapImmediate(viewId, previousViewId);
          stateManager.set("navigation.currentViewId", viewId);
        });

        this.eventBus.emit("view-changed", {
          newViewId: viewId,
          previousViewId,
        });
        log.trace(`Navigation to ${viewId} completed successfully with overlay`);
      } else {
        // No overlay - use standard transition
        await this.performViewTransition(viewId, config);
        stateManager.set("navigation.currentViewId", viewId);

        this.eventBus.emit("view-changed", {
          newViewId: viewId,
          previousViewId,
        });
        log.trace(`Navigation to ${viewId} completed successfully`);
      }
    } catch (error) {
      log.error(`Navigation to ${viewId} failed:`, error as Error);
      throw error;
    } finally {
      stateManager.set("navigation.isTransitioning", false);
    }
  }

  private async performPageTransition(targetPageId: string, config: TransitionConfig): Promise<void> {
    const currentPageId = stateManager.get("navigation.currentPageId") as string;
    const currentPage = currentPageId ? this.pages.get(currentPageId) : null;
    const targetPage = this.pages.get(targetPageId)!;

    // Validate and normalize config
    const normalizedConfig = this.normalizeTransitionConfig(config);

    // Show target page first (but invisible)
    this.showPage(targetPageId);

    if (currentPage) {
      await this.animateOut(currentPage.getHostElement(), normalizedConfig);
      this.hidePage(currentPage.componentId);
    }

    await this.animateIn(targetPage.getHostElement(), normalizedConfig);
  }

  /**
   * Perform an immediate view swap (no animation) - used when transition overlay is handling the fade
   */
  private async performViewSwapImmediate(targetViewId: string, currentViewId: string | null): Promise<void> {
    const currentView = currentViewId ? this.views.get(currentViewId) : null;
    const targetView = this.views.get(targetViewId)!;

    // Hide current view immediately
    if (currentView) {
      this.hideView(currentViewId!);
    }

    // Show target view immediately (no animation since overlay handles the fade)
    this.showView(targetViewId, false);
    const element = targetView.getHostElement();
    element.style.opacity = "1";
    element.style.visibility = "visible";
    element.style.transform = "none";
  }

  private async performViewTransition(targetViewId: string, config: TransitionConfig): Promise<void> {
    const currentViewId = stateManager.get("navigation.currentViewId") as string;
    const currentView = currentViewId ? this.views.get(currentViewId) : null;
    const targetView = this.views.get(targetViewId)!;

    // Validate and normalize config
    const normalizedConfig = this.normalizeTransitionConfig(config);

    // Show target view first (before animation)
    this.showView(targetViewId, normalizedConfig.type !== "snap");

    // Animate if needed
    if (currentView) {
      await this.animateOut(currentView.getHostElement(), normalizedConfig);
      // Hide current view after animation completes
      this.hideView(currentViewId!);
    }

    await this.animateIn(targetView.getHostElement(), normalizedConfig);
  }

  private async animateOut(element: HTMLElement, config: TransitionConfig): Promise<void> {
    // Handle snap navigation - immediate hide with no animation
    if (config.type === "snap") {
      element.style.transition = "none";
      element.style.opacity = "0";
      element.style.visibility = "hidden";
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const duration = config.duration || 300;
      element.style.transition = `all ${duration}ms ${config.easing || "ease-in-out"}`;

      let transitionendFired = false;
      let fallbackTimerId: number | null = null;

      const cleanup = () => {
        if (transitionendFired) return; // Prevent double execution
        transitionendFired = true;

        // Clean up both the event listener and timeout
        element.removeEventListener("transitionend", transitionendHandler);
        if (fallbackTimerId !== null) {
          clearTimeout(fallbackTimerId);
          fallbackTimerId = null;
        }

        // Remove from active transitions map
        this.activeTransitionCleanups.delete(element);

        resolve();
      };

      const transitionendHandler = () => {
        cleanup();
      };

      element.addEventListener("transitionend", transitionendHandler, { once: true });

      // Store cleanup function for this element
      this.activeTransitionCleanups.set(element, cleanup);

      // Apply exit animation
      switch (config.type) {
        case "slide":
          element.classList.add(`slide-out-${config.direction || "left"}`);
          break;
        case "fade":
          element.classList.add("fade-out");
          break;
        case "scale":
          element.classList.add("scale-out");
          break;
        case "flip":
          element.classList.add("flip-out");
          break;
        case "custom":
          if (config.customCSS) {
            element.style.cssText += config.customCSS;
          }
          break;
      }

      // Fallback timeout
      fallbackTimerId = window.setTimeout(() => {
        log.trace("Transition fallback timeout triggered for animateOut");
        cleanup();
      }, duration + 50);
    });
  }

  private async animateIn(element: HTMLElement, config: TransitionConfig): Promise<void> {
    // Handle snap navigation - immediate show with no animation
    if (config.type === "snap") {
      element.style.transition = "none";
      element.style.opacity = "1";
      element.style.visibility = "visible";
      element.style.transform = "none";
      this.clearAnimationClasses(element);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const duration = config.duration || 300;
      element.style.transition = `all ${duration}ms ${config.easing || "ease-in-out"}`;

      let transitionendFired = false;
      let fallbackTimerId: number | null = null;

      const cleanup = () => {
        if (transitionendFired) return; // Prevent double execution
        transitionendFired = true;

        // Clean up both the event listener and timeout
        element.removeEventListener("transitionend", transitionendHandler);
        if (fallbackTimerId !== null) {
          clearTimeout(fallbackTimerId);
          fallbackTimerId = null;
        }

        // Remove from active transitions map
        this.activeTransitionCleanups.delete(element);

        this.clearAnimationClasses(element);
        resolve();
      };

      const transitionendHandler = () => {
        cleanup();
      };

      element.addEventListener("transitionend", transitionendHandler, { once: true });

      // Store cleanup function for this element
      this.activeTransitionCleanups.set(element, cleanup);

      // Set initial state
      switch (config.type) {
        case "slide":
          element.classList.add(`slide-in-${config.direction || "right"}`);
          break;
        case "fade":
          element.classList.add("fade-in");
          break;
        case "scale":
          element.classList.add("scale-in");
          break;
        case "flip":
          element.classList.add("flip-in");
          break;
      }

      // Animate to active state
      requestAnimationFrame(() => {
        switch (config.type) {
          case "slide":
            element.classList.remove(`slide-in-${config.direction || "right"}`);
            element.classList.add("slide-active");
            break;
          case "fade":
            element.classList.remove("fade-in");
            element.classList.add("fade-active");
            break;
          case "scale":
            element.classList.remove("scale-in");
            element.classList.add("scale-active");
            break;
          case "flip":
            element.classList.remove("flip-in");
            element.classList.add("flip-active");
            break;
        }
      });

      // Fallback timeout
      fallbackTimerId = window.setTimeout(() => {
        log.trace("Transition fallback timeout triggered for animateIn");
        cleanup();
      }, duration + 50);
    });
  }

  private normalizeTransitionConfig(config: TransitionConfig): TransitionConfig {
    // If config is missing or invalid, fallback to snap
    if (!config || !config.type) {
      log.warn("Invalid transition config, falling back to snap navigation");
      return { type: "snap" };
    }

    // For animated transitions, ensure duration is set
    if (config.type !== "snap" && config.type !== "custom") {
      if (!config.duration || config.duration <= 0) {
        log.warn(`Invalid duration for ${config.type} transition, falling back to snap navigation`);
        return { type: "snap" };
      }
    }

    return config;
  }

  private clearAnimationClasses(element: HTMLElement): void {
    const animationClasses = [
      "slide-out-left",
      "slide-out-right",
      "slide-out-up",
      "slide-out-down",
      "slide-in-left",
      "slide-in-right",
      "slide-in-up",
      "slide-in-down",
      "slide-active",
      "fade-out",
      "fade-in",
      "fade-active",
      "scale-out",
      "scale-in",
      "scale-active",
      "flip-out",
      "flip-in",
      "flip-active",
    ];
    element.classList.remove(...animationClasses);
  }

  private showPage(pageId: string): void {
    const page = this.pages.get(pageId);
    if (page) {
      const element = page.getHostElement();
      element.style.display = "";  // Clear the inline display:none
      element.classList.remove("nav-hidden", "out");
      element.classList.add("in");
    }
  }

  private hidePage(pageId: string): void {
    const page = this.pages.get(pageId);
    if (page) {
      const element = page.getHostElement();
      element.classList.add("nav-hidden");
      // Set display none after a short delay to allow animation to complete
      setTimeout(() => {
        if (element.classList.contains("nav-hidden")) {
          element.style.display = "none";
        }
      }, 50);
    }
  }

  private showView(viewId: string, animate: boolean = true): void {
    const view = this.views.get(viewId);
    if (view) {
      const element = view.getHostElement();
      element.style.display = "block";
      element.classList.remove("nav-hidden");
      element.style.visibility = "visible";
      if (!animate) {
        element.style.opacity = "1";
        element.style.transform = "none";
      }
      // When animating, let CSS animation classes control opacity entirely
      // Don't set inline opacity as it would override CSS classes
    }
  }

  private hideView(viewId: string): void {
    const view = this.views.get(viewId);
    if (view) {
      const element = view.getHostElement();
      element.classList.add("nav-hidden");
      element.style.display = "none";
      element.style.visibility = "hidden";
    }
  }

  private hideAllViews(): void {
    // Hide all registered views to ensure clean state
    this.views.forEach((_, viewId) => {
      this.hideView(viewId);
    });
    log.trace("All views hidden");
  }

  public getCurrentPageId(): string | null {
    return stateManager.get("navigation.currentPageId");
  }

  public getCurrentViewId(): string | null {
    return stateManager.get("navigation.currentViewId");
  }

  public isTransitioning(): boolean {
    return stateManager.get("navigation.isTransitioning");
  }

  public getRegisteredPages(): string[] {
    return Array.from(this.pages.keys());
  }

  public getRegisteredViews(): string[] {
    return Array.from(this.views.keys());
  }

  // Convenience methods for external components to subscribe to navigation state
  public subscribeToCurrentPage(callback: (pageId: string | null) => void): StateSubscription {
    return stateManager.subscribe("navigation.currentPageId", callback);
  }

  public subscribeToCurrentView(callback: (viewId: string | null) => void): StateSubscription {
    return stateManager.subscribe("navigation.currentViewId", callback);
  }

  public subscribeToTransitionState(callback: (isTransitioning: boolean) => void): StateSubscription {
    return stateManager.subscribe("navigation.isTransitioning", callback);
  }

  /**
   * Clean up any orphaned transition listeners
   * This is a safety net for transitions that didn't complete properly
   */
  public cleanupOrphanedTransitions(): void {
    const orphanedCount = this.activeTransitionCleanups.size;
    if (orphanedCount > 0) {
      log.trace(`Cleaning up ${orphanedCount} orphaned transition(s)`);
      this.activeTransitionCleanups.forEach((cleanup, element) => {
        try {
          cleanup();
        } catch (error) {
          log.error(`Error cleaning up orphaned transition for element with ID ${element.id}:`, error as Error);
        }
      });
      this.activeTransitionCleanups.clear();
    }
  }

  /**
   * Get the count of active transitions
   */
  public getActiveTransitionCount(): number {
    return this.activeTransitionCleanups.size;
  }

  /**
   * Cleanup method for proper resource management
   * 
   * Destroys the NavigationManager instance and clears the singleton reference.
   * After calling destroy(), a new NavigationManager instance can be created if needed
   * (though this is typically only necessary during application teardown/restart).
   */
  public destroy(): void {
    // Clean up any active transitions
    this.cleanupOrphanedTransitions();

    // Clean up any state subscriptions
    this.stateSubscriptions.forEach((subscription) => {
      subscription.unsubscribe();
    });
    this.stateSubscriptions.length = 0;

    // Clear local maps
    this.pages.clear();
    this.views.clear();

    // Clear the singleton instance reference to allow new instance creation
    NavigationManager.instance = null;
    NavigationManager.isDestroyed = true;

    log.trace("NavigationManager singleton instance destroyed and cleared");
  }
}
