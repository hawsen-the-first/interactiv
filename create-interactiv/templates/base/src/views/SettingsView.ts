import { View, html, css } from "interactiv";
import type { ViewProps } from "interactiv";

interface Props extends ViewProps {}

export default function SettingsView(props: Props) {
  const { id, orchestrator, bubbleEvents } = props;

  const viewTemplate = html`
    <div class="settings-view">
      <div class="settings-container">
        <div class="settings-header">
          <h1>⚙️ Settings</h1>
          <p class="subtitle">Configure your application</p>
        </div>

        <div class="card">
          <h2>Hidden Settings Page</h2>
          <p>
            This settings page is activated by touching the corners in sequence:
          </p>
          <ol>
            <li>Top-left corner</li>
            <li>Top-right corner</li>
            <li>Bottom-right corner</li>
          </ol>
          <p style="margin-top: 1rem;">
            Touch anywhere on the screen to exit settings and return to the app.
          </p>
        </div>

        <div class="card">
          <h2>Application Info</h2>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">Framework:</span>
              <span class="info-value">Interactiv</span>
            </div>
            <div class="info-item">
              <span class="info-label">Version:</span>
              <span class="info-value">2.0.0</span>
            </div>
            <div class="info-item">
              <span class="info-label">Build Target:</span>
              <span class="info-value">BrightSign</span>
            </div>
            <div class="info-item">
              <span class="info-label">Project:</span>
              <span class="info-value">{{PROJECT_NAME}}</span>
            </div>
          </div>
        </div>

        <div class="card">
          <h2>Features Enabled</h2>
          <ul class="features-list">
            <li class="feature-item">
              <span class="feature-icon">✓</span>
              <span>Animations: {{USE_ANIMATIONS}}</span>
            </li>
            <li class="feature-item">
              <span class="feature-icon">✓</span>
              <span>Debug Mode: {{DEBUG_MODE}}</span>
            </li>
            <li class="feature-item">
              <span class="feature-icon">✓</span>
              <span>Log Level: {{LOG_LEVEL}}</span>
            </li>
          </ul>
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

    .settings-view {
      width: 100%;
      min-height: 100vh;
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
      padding: 2rem;
    }

    .settings-container {
      max-width: 900px;
      margin: 0 auto;
    }

    .settings-header {
      text-align: center;
      color: white;
      margin-bottom: 2rem;
    }

    .settings-header h1 {
      font-size: 3rem;
      margin-bottom: 0.5rem;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
    }

    .subtitle {
      font-size: 1.3rem;
      opacity: 0.9;
    }

    .card {
      background: white;
      border-radius: 12px;
      padding: 2rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    }

    .card h2 {
      color: #f5576c;
      margin-bottom: 1rem;
      font-size: 1.8rem;
    }

    .card p {
      line-height: 1.8;
      color: #555;
    }

    .card ol {
      margin-left: 2rem;
      margin-top: 1rem;
    }

    .card ol li {
      margin-bottom: 0.5rem;
      font-size: 1.1rem;
      color: #555;
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-top: 1rem;
    }

    .info-item {
      display: flex;
      flex-direction: column;
      padding: 1rem;
      background: #f8f9fa;
      border-radius: 8px;
    }

    .info-label {
      font-size: 0.9rem;
      color: #666;
      margin-bottom: 0.25rem;
    }

    .info-value {
      font-size: 1.2rem;
      color: #333;
      font-weight: 600;
    }

    .features-list {
      list-style: none;
      padding: 0;
      margin-top: 1rem;
    }

    .feature-item {
      display: flex;
      align-items: center;
      padding: 1rem;
      background: #f8f9fa;
      border-radius: 8px;
      margin-bottom: 0.5rem;
    }

    .feature-icon {
      color: #4caf50;
      font-size: 1.5rem;
      margin-right: 1rem;
      font-weight: bold;
    }

    .feature-item span:last-child {
      font-size: 1.1rem;
      color: #333;
    }
  `;

  const view = new View(id, orchestrator, bubbleEvents, viewTemplate, viewStyles);

  return view;
}
