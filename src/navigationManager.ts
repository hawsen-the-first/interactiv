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

export class NavigationManager {
  private eventBus: EventBus;
  private orchestrator: EventOrchestrator;
  private pages: Map<string, Page> = new Map();
  private views: Map<string, View> = new Map();
  private stateSubscriptions: StateSubscription[] = [];

  constructor(orchestrator: EventOrchestrator) {
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
      this.eventBus.emit("view-re-entered", { viewId });
      return; // Already on this view
    }

    const previousViewId = stateManager.get("navigation.currentViewId");
    log.trace(`Starting navigation from ${previousViewId} to ${viewId}`);
    stateManager.set("navigation.isTransitioning", true);

    try {
      await this.performViewTransition(viewId, config);
      stateManager.set("navigation.currentViewId", viewId);

      this.eventBus.emit("view-changed", {
        newViewId: viewId,
        previousViewId,
      });
      log.trace(`Navigation to ${viewId} completed successfully`);
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

      const cleanup = () => {
        element.removeEventListener("transitionend", cleanup);
        resolve();
      };

      element.addEventListener("transitionend", cleanup);

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
      setTimeout(cleanup, duration + 50);
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

      const cleanup = () => {
        element.removeEventListener("transitionend", cleanup);
        this.clearAnimationClasses(element);
        resolve();
      };

      element.addEventListener("transitionend", cleanup);

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
      setTimeout(cleanup, duration + 50);
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
      element.classList.remove("out");
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

  // Cleanup method for proper resource management
  public destroy(): void {
    // Clean up any state subscriptions
    this.stateSubscriptions.forEach((subscription) => {
      subscription.unsubscribe();
    });
    this.stateSubscriptions.length = 0;

    // Clear local maps
    this.pages.clear();
    this.views.clear();
  }
}
