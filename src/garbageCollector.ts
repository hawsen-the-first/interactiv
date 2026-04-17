import { logger } from "./logger";
import type { EventOrchestrator } from "./eventBus";
import type { AnimationManager } from "./animationBus";
import { NavigationManager } from "./navigationManager";

const log = logger;

export interface GarbageCollectionStats {
  timestamp: number;
  animationsCleaned: number;
  expiredEventsCleaned: number;
  orphanedTransitionsCleaned: number;
  totalListeners: number;
  queueSize: number;
  activeAnimations: number;
  activeTransitions: number;
}

export class GarbageCollector {
  private orchestrator: EventOrchestrator;
  private animationManager?: AnimationManager;
  private cleanupInterval: number | null = null;
  private stats: GarbageCollectionStats[] = [];
  private readonly MAX_STATS_HISTORY = 50; // Keep last 50 cleanup runs

  constructor(
    orchestrator: EventOrchestrator,
    animationManager?: AnimationManager
  ) {
    this.orchestrator = orchestrator;
    this.animationManager = animationManager;
  }

  /**
   * Start automatic garbage collection at specified interval
   * @param intervalMinutes - How often to run cleanup (default: 5 minutes)
   */
  public startAutoCleanup(intervalMinutes: number = 5): void {
    if (this.cleanupInterval !== null) {
      log.warn("Auto cleanup already running");
      return;
    }

    const intervalMs = intervalMinutes * 60 * 1000;
    log.trace(`Starting automatic garbage collection every ${intervalMinutes} minute(s)`);

    this.cleanupInterval = window.setInterval(() => {
      this.runCleanup();
    }, intervalMs);

    // Run initial cleanup
    this.runCleanup();
  }

  /**
   * Stop automatic garbage collection
   */
  public stopAutoCleanup(): void {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      log.trace("Automatic garbage collection stopped");
    }
  }

  /**
   * Manually trigger a garbage collection run
   */
  public runCleanup(): GarbageCollectionStats {
    const startTime = Date.now();
    log.trace("Running garbage collection...");

    const stats: GarbageCollectionStats = {
      timestamp: startTime,
      animationsCleaned: 0,
      expiredEventsCleaned: 0,
      orphanedTransitionsCleaned: 0,
      totalListeners: 0,
      queueSize: 0,
      activeAnimations: 0,
      activeTransitions: 0,
    };

    // Clean up stale animations
    if (this.animationManager) {
      const beforeAnimations = this.animationManager.getActiveAnimationCount();
      this.animationManager.cleanupStaleAnimations();
      const afterAnimations = this.animationManager.getActiveAnimationCount();
      stats.animationsCleaned = beforeAnimations - afterAnimations;
      stats.activeAnimations = afterAnimations;
    }

    // Clean up expired events from queue
    const expiredEvents = this.orchestrator.cleanupExpiredEvents();
    stats.expiredEventsCleaned = expiredEvents;
    stats.queueSize = this.orchestrator.getQueueSize();
    stats.totalListeners = this.orchestrator.getTotalListenerCount();

    // Clean up orphaned navigation transitions - get singleton instance
    const navigationManager = NavigationManager.getInstance();
    if (navigationManager) {
      const beforeTransitions = navigationManager.getActiveTransitionCount();
      navigationManager.cleanupOrphanedTransitions();
      const afterTransitions = navigationManager.getActiveTransitionCount();
      stats.orphanedTransitionsCleaned = beforeTransitions - afterTransitions;
      stats.activeTransitions = afterTransitions;
    }

    const duration = Date.now() - startTime;
    
    // Log summary
    const totalCleaned = stats.animationsCleaned + stats.expiredEventsCleaned + stats.orphanedTransitionsCleaned;
    
    if (totalCleaned > 0) {
      log.trace(
        `Garbage collection complete in ${duration}ms. Cleaned: ${stats.animationsCleaned} animations, ` +
        `${stats.expiredEventsCleaned} expired events, ${stats.orphanedTransitionsCleaned} transitions. ` +
        `Active: ${stats.activeAnimations} animations, ${stats.activeTransitions} transitions, ` +
        `${stats.totalListeners} listeners, queue size: ${stats.queueSize}`
      );
    } else {
      log.trace(
        `Garbage collection complete in ${duration}ms. Nothing to clean. ` +
        `Active: ${stats.activeAnimations} animations, ${stats.activeTransitions} transitions, ` +
        `${stats.totalListeners} listeners, queue size: ${stats.queueSize}`
      );
    }

    // Store stats
    this.stats.push(stats);
    if (this.stats.length > this.MAX_STATS_HISTORY) {
      this.stats.shift(); // Remove oldest
    }

    return stats;
  }

  /**
   * Get statistics from previous cleanup runs
   */
  public getStats(): GarbageCollectionStats[] {
    return [...this.stats];
  }

  /**
   * Get the most recent cleanup stats
   */
  public getLatestStats(): GarbageCollectionStats | null {
    return this.stats.length > 0 ? this.stats[this.stats.length - 1] : null;
  }

  /**
   * Get a summary report of memory usage trends
   */
  public getMemoryReport(): {
    averageAnimations: number;
    averageListeners: number;
    averageQueueSize: number;
    averageTransitions: number;
    totalCleanups: number;
    totalItemsCleaned: number;
  } {
    if (this.stats.length === 0) {
      return {
        averageAnimations: 0,
        averageListeners: 0,
        averageQueueSize: 0,
        averageTransitions: 0,
        totalCleanups: 0,
        totalItemsCleaned: 0,
      };
    }

    const sum = this.stats.reduce(
      (acc, stat) => ({
        animations: acc.animations + stat.activeAnimations,
        listeners: acc.listeners + stat.totalListeners,
        queueSize: acc.queueSize + stat.queueSize,
        transitions: acc.transitions + stat.activeTransitions,
        cleaned: acc.cleaned + stat.animationsCleaned + stat.expiredEventsCleaned + stat.orphanedTransitionsCleaned,
      }),
      { animations: 0, listeners: 0, queueSize: 0, transitions: 0, cleaned: 0 }
    );

    return {
      averageAnimations: sum.animations / this.stats.length,
      averageListeners: sum.listeners / this.stats.length,
      averageQueueSize: sum.queueSize / this.stats.length,
      averageTransitions: sum.transitions / this.stats.length,
      totalCleanups: this.stats.length,
      totalItemsCleaned: sum.cleaned,
    };
  }

  /**
   * Clear all stats history
   */
  public clearStats(): void {
    this.stats = [];
  }

  /**
   * Destroy the garbage collector and stop auto cleanup
   */
  public destroy(): void {
    this.stopAutoCleanup();
    this.clearStats();
    log.trace("GarbageCollector destroyed");
  }
}

/**
 * Create and configure a garbage collector instance
 * 
 * Note: NavigationManager is automatically retrieved via singleton pattern
 * when needed during cleanup operations.
 */
export function createGarbageCollector(
  orchestrator: EventOrchestrator,
  animationManager?: AnimationManager,
  autoStart: boolean = true,
  intervalMinutes: number = 5
): GarbageCollector {
  const gc = new GarbageCollector(orchestrator, animationManager);
  
  if (autoStart) {
    gc.startAutoCleanup(intervalMinutes);
  }
  
  return gc;
}
