import { renderDashboard } from "./views/dashboard.js";
import { renderRules } from "./views/rules.js";
import { renderQueue } from "./views/queue.js";
import { renderHistory } from "./views/history.js";
import { renderEngines } from "./views/engines.js";
import { renderSettings } from "./views/settings.js";

type ViewName = "dashboard" | "rules" | "queue" | "history" | "engines" | "settings";

const RENDERERS: Record<ViewName, (root: HTMLElement) => Promise<void>> = {
  dashboard: renderDashboard,
  rules: renderRules,
  queue: renderQueue,
  history: renderHistory,
  engines: renderEngines,
  settings: renderSettings,
};

const content = document.getElementById("content") as HTMLElement;
const navItems = document.querySelectorAll<HTMLButtonElement>(".nav-item");

async function showView(view: ViewName): Promise<void> {
  navItems.forEach((el) => el.classList.toggle("active", el.dataset.view === view));
  content.innerHTML = `<p class="view-subtitle">Loading&hellip;</p>`;
  try {
    await RENDERERS[view](content);
  } catch (err) {
    content.innerHTML = `<div class="card"><strong style="color:var(--danger)">Something went wrong loading this view.</strong><p class="field-hint">${(err as Error).message}</p></div>`;
  }
}

navItems.forEach((el) => {
  el.addEventListener("click", () => {
    void showView(el.dataset.view as ViewName);
  });
});

const hash = window.location.hash.replace("#", "") as ViewName;
void showView(RENDERERS[hash] ? hash : "dashboard");
