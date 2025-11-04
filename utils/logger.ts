/* eslint-disable no-console */
export class Logger {
  debugMode: boolean;
  // 'trace' // 'errors' // 'none'
  minLoglevel: string;
  constructor(debugMode: boolean = false, minLogLevel: string = "none") {
    this.debugMode = debugMode;
    this.minLoglevel = minLogLevel;
  }

  trace(message: string, object?: object) {
    if (this.minLoglevel === "trace" || this.debugMode) {
      new Trace(message, object);
    }
  }

  warn(message: string) {
    if (this.minLoglevel === "warn" || this.minLoglevel === "trace" || this.debugMode) {
      console.warn(message);
    }
  }

  error(message: string, error: Error) {
    if (this.minLoglevel === "trace" || this.minLoglevel === "warn" || this.minLoglevel === "error" || this.debugMode) {
      console.groupCollapsed("Error: " + message);
      console.error(error);
      console.groupEnd();
    }
  }
}

class Trace {
  private errorObj = new Error();
  public message: string;
  public stackTrace = this.errorObj.stack;
  constructor(message: string, object?: object) {
    this.message = message;
    console.groupCollapsed("Trace: " + message);
    console.log(message);
    console.log(this.stackTrace?.replace("Error", "Stack Trace"));
    if (object) {
      console.dir(object);
    }
    console.groupEnd();
  }
}
