import { View, html, css } from "interactiv";
import type { ViewProps } from "interactiv";
import ExampleComponent from "../components/ExampleComponent";

interface Props extends ViewProps {}

export default function HomeView(props: Props) {
  const { id, orchestrator, bubbleEvents } = props;

  const viewTemplate = html`
    <div class="home-view">
      <div class="container">
        <div class="header">
          <h1>Welcome to Interactiv!</h1>
          <p class="subtitle">Your BrightSign-ready interactive application</p>
        </div>

        <div class="card">
          <h2>🚀 Getting Started</h2>
          <p>This project includes:</p>
          <ul>
            <li>✓ Page, View, and Component architecture</li>
            <li>✓ Screensaver functionality (activates after 30s)</li>
            <li>✓ Hidden settings page (touch corners: top-left → top-right → bottom-right)</li>
            <li>✓ BrightSign-optimized Vite configuration</li>
            <li>✓ State management and event handling</li>
          </ul>
        </div>

        <div class="components-section">
          <h2>Example Components</h2>
          <div class="children-container"></div>
        </div>
      </div>
    </div>
  `;

  const viewStyles = css`
    :host {
      display: block;
      width: 100%;
      height: 100vh;
      overflow-y: auto;
    }

    .home-view {
      width: 100%;
      min-height: 100vh;
      color: white;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 3rem 2rem;
    }

    .header {
      text-align: center;
      margin-bottom: 3rem;
    }

    .header h1 {
      font-size: 3rem;
      margin-bottom: 1rem;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
    }

    .subtitle {
      font-size: 1.5rem;
      opacity: 0.9;
    }

    .card {
      background: rgba(255, 255, 255, 0.95);
      color: #333;
      border-radius: 12px;
      padding: 2rem;
      margin-bottom: 2rem;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    }

    .card h2 {
      color: #667eea;
      margin-bottom: 1rem;
    }

    .card ul {
      margin-left: 1.5rem;
      margin-top: 1rem;
    }

    .card li {
      margin-bottom: 0.5rem;
      font-size: 1.1rem;
    }

    .components-section {
      margin-top: 2rem;
    }

    .components-section h2 {
      color: white;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
      margin-bottom: 1.5rem;
    }

    .children-container {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
  `;

  const view = new View(id, orchestrator, bubbleEvents, viewTemplate, viewStyles);
  view.setProperty("viewTitle", "Home View");

  // Add example component
  const exampleComponent = ExampleComponent({
    id: "example-component-1",
    orchestrator,
    bubbleEvents: false,
  });
  view.addComponent(exampleComponent);

  return view;
}
