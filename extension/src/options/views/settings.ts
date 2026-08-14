import { send } from "../api.js";

interface AppSettings {
  monitoringEnabled: boolean;
  defaultOutputLocation: "same-folder" | "dedicated-folder" | "per-format-folder";
  defaultDedicatedFolderName: string;
  automaticConversionDefault: boolean;
  deleteOriginalDefault: boolean;
  overwriteBehaviorDefault: "rename" | "overwrite" | "skip";
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  maxConcurrentConversions: number;
  language: "en" | "vi";
  theme: "light" | "dark" | "system";
}

export async function renderSettings(root: HTMLElement): Promise<void> {
  const s = await send<AppSettings>({ type: "getSettings" });

  root.innerHTML = `
    <h1>Settings</h1>
    <p class="view-subtitle">Defaults used for new rules and overall extension behavior.</p>

    <div class="card settings-section">
      <h2>General</h2>
      <div class="settings-row">
        <div><div class="label">Monitor downloads</div><div class="desc">Watch new downloads and match them against your rules automatically.</div></div>
        ${toggle("monitoringEnabled", s.monitoringEnabled)}
      </div>
      <div class="settings-row">
        <div><div class="label">Maximum concurrent conversions</div><div class="desc">How many files can convert at the same time. Higher uses more CPU.</div></div>
        <select id="f-concurrency">${[1, 2, 3, 4].map((n) => `<option value="${n}" ${n === s.maxConcurrentConversions ? "selected" : ""}>${n}</option>`).join("")}</select>
      </div>
      <div class="settings-row">
        <div><div class="label">Language</div></div>
        <select id="f-language">
          <option value="en" ${s.language === "en" ? "selected" : ""}>English</option>
          <option value="vi" ${s.language === "vi" ? "selected" : ""}>Ti\u1ebfng Vi\u1ec7t</option>
        </select>
      </div>
      <div class="settings-row">
        <div><div class="label">Theme</div></div>
        <select id="f-theme">
          <option value="system" ${s.theme === "system" ? "selected" : ""}>System</option>
          <option value="dark" ${s.theme === "dark" ? "selected" : ""}>Dark</option>
          <option value="light" ${s.theme === "light" ? "selected" : ""}>Light</option>
        </select>
      </div>
    </div>

    <div class="card settings-section">
      <h2>New rule defaults</h2>
      <div class="settings-row">
        <div><div class="label">Default output folder</div></div>
        <select id="f-outputloc">
          <option value="same-folder" ${s.defaultOutputLocation === "same-folder" ? "selected" : ""}>Same folder</option>
          <option value="dedicated-folder" ${s.defaultOutputLocation === "dedicated-folder" ? "selected" : ""}>Dedicated folder</option>
          <option value="per-format-folder" ${s.defaultOutputLocation === "per-format-folder" ? "selected" : ""}>Per-format folder</option>
        </select>
      </div>
      <div class="settings-row">
        <div><div class="label">Automatic conversion</div></div>
        ${toggle("automaticConversionDefault", s.automaticConversionDefault)}
      </div>
      <div class="settings-row">
        <div><div class="label">Delete original after conversion</div></div>
        ${toggle("deleteOriginalDefault", s.deleteOriginalDefault)}
      </div>
      <div class="settings-row">
        <div><div class="label">On filename collision</div></div>
        <select id="f-overwrite">
          <option value="rename" ${s.overwriteBehaviorDefault === "rename" ? "selected" : ""}>Add (1), (2)&hellip;</option>
          <option value="overwrite" ${s.overwriteBehaviorDefault === "overwrite" ? "selected" : ""}>Overwrite</option>
          <option value="skip" ${s.overwriteBehaviorDefault === "skip" ? "selected" : ""}>Skip conversion</option>
        </select>
      </div>
    </div>

    <div class="card settings-section">
      <h2>Notifications</h2>
      <div class="settings-row">
        <div><div class="label">Notify on success</div></div>
        ${toggle("notifyOnSuccess", s.notifyOnSuccess)}
      </div>
      <div class="settings-row">
        <div><div class="label">Notify on failure</div></div>
        ${toggle("notifyOnFailure", s.notifyOnFailure)}
      </div>
    </div>

    <button class="btn primary" id="saveSettings">Save settings</button>
    <span class="field-hint" id="saveStatus" style="margin-left:10px"></span>
  `;

  root.querySelector("#saveSettings")?.addEventListener("click", async () => {
    const q = (id: string) => (root.querySelector(id) as HTMLInputElement | HTMLSelectElement).value;
    const checked = (id: string) => (root.querySelector(id) as HTMLInputElement).checked;
    const patch: Partial<AppSettings> = {
      monitoringEnabled: checked("#toggle-monitoringEnabled"),
      maxConcurrentConversions: Number(q("#f-concurrency")),
      language: q("#f-language") as AppSettings["language"],
      theme: q("#f-theme") as AppSettings["theme"],
      defaultOutputLocation: q("#f-outputloc") as AppSettings["defaultOutputLocation"],
      automaticConversionDefault: checked("#toggle-automaticConversionDefault"),
      deleteOriginalDefault: checked("#toggle-deleteOriginalDefault"),
      overwriteBehaviorDefault: q("#f-overwrite") as AppSettings["overwriteBehaviorDefault"],
      notifyOnSuccess: checked("#toggle-notifyOnSuccess"),
      notifyOnFailure: checked("#toggle-notifyOnFailure"),
    };
    await send({ type: "updateSettings", patch });
    const status = root.querySelector("#saveStatus") as HTMLElement;
    status.textContent = "Saved.";
    setTimeout(() => (status.textContent = ""), 2000);
  });
}

function toggle(key: string, value: boolean): string {
  return `<label class="pill-toggle"><input type="checkbox" id="toggle-${key}" ${value ? "checked" : ""}><span class="track"></span></label>`;
}
