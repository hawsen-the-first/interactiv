import { Logger } from "../utils/logger";

// Centralized logger instance for internal package use
// Default configuration: error-only logging for production builds
const logger = new Logger(false, "error");

/**
 * Configure the internal package logger
 * This allows consuming projects to adjust logging levels without creating their own logger
 * @param debugMode Enable debug mode (overrides minLogLevel)
 * @param minLogLevel Minimum log level: 'none' | 'error' | 'warn' | 'trace'
 */
export function configureLogger(debugMode: boolean = false, minLogLevel: string = "error"): void {
  logger.debugMode = debugMode;
  logger.minLoglevel = minLogLevel;
}

export { logger };
