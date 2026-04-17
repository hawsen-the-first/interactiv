import { Component, html, css } from "interactiv";
import type { ComponentProps } from "interactiv";

interface Props extends ComponentProps {}

export default function ExampleComponent(props: Props) {
  const { id, orchestrator, bubbleEvents } = props;

  const componentTemplate = html`
    <div class="example-component">
      <div class="component-header">
        <h3>Interactive Counter Component</h3>
        <p class="description">Demonstrates state management and event handling</p>
      </div>

      <div class="counter-display">
        <span class="counter-value">{{count}}</span>
      </div>

      <div class="button-group">
        <button class="btn btn-decrement">-</button>
        <button class="btn btn-reset">Reset</button>
        <button class="btn btn-increment">+</button>
      </div>

      <div class="info">
        <p>Click count: {{clickCount}}</p>
        <p class="status-text">Status: {{status}}</p>
      </div>
    </div>
  `;

  const componentStyles = css`
    :host {
      display: block;
    }

    .example-component {
      background: rgba(255, 255, 255, 0.95);
      border-radius: 12px;
      padding: 2rem;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    }

    .component-header {
      margin-bottom: 2rem;
    }

    .component-header h3 {
      color: #667eea;
      margin-bottom: 0.5rem;
      font-size: 1.5rem;
    }

    .description {
      color: #666;
      font-size: 1rem;
    }

    .counter-display {
      text-align: center;
      margin: 2rem 0;
    }

    .counter-value {
      font-size: 4rem;
      font-weight: bold;
      color: #667eea;
      text-shadow: 2px 2px 4px rgba(102, 126, 234, 0.2);
    }

    .button-group {
      display: flex;
      gap: 1rem;
      justify-content: center;
      margin: 2rem 0;
    }

    .btn {
      padding: 1rem 2rem;
      font-size: 1.2rem;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.3s ease;
      min-width: 100px;
    }

    .btn-increment {
      background: #4caf50;
      color: white;
    }

    .btn-increment:hover {
      background: #45a049;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4);
    }

    .btn-decrement {
      background: #f44336;
      color: white;
    }

    .btn-decrement:hover {
      background: #da190b;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(244, 67, 54, 0.4);
    }

    .btn-reset {
      background: #757575;
      color: white;
    }

    .btn-reset:hover {
      background: #616161;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(117, 117, 117, 0.4);
    }

    .info {
      text-align: center;
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 2px solid #eee;
    }

    .info p {
      color: #666;
      font-size: 1rem;
      margin: 0.5rem 0;
    }

    .status-text {
      font-weight: 600;
      color: #667eea;
    }
  `;

  const component = new Component(id, orchestrator, bubbleEvents, componentTemplate, componentStyles);

  // Initialize local state
  component.defineState({
    count: 0,
    clickCount: 0,
    status: "Ready"
  });

  // Setup event handlers after render
  const originalOnAfterRender = component.onAfterRender.bind(component);
  component.onAfterRender = function() {
    originalOnAfterRender();

    // Increment button
    this.point(".btn-increment", () => {
      this.state.count += 1;
      this.state.clickCount += 1;
      this.state.status = "Incremented";
      
      // Reset status after 1 second
      setTimeout(() => {
        this.state.status = "Ready";
      }, 1000);
    });

    // Decrement button
    this.point(".btn-decrement", () => {
      this.state.count -= 1;
      this.state.clickCount += 1;
      this.state.status = "Decremented";
      
      setTimeout(() => {
        this.state.status = "Ready";
      }, 1000);
    });

    // Reset button
    this.point(".btn-reset", () => {
      this.state.count = 0;
      this.state.status = "Reset";
      
      setTimeout(() => {
        this.state.status = "Ready";
      }, 1000);
    });
  };

  return component;
}
