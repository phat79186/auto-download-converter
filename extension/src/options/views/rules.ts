import { send, escapeHtml } from "../api.js";
import { allSourceExtensions, conversionsForSource } from "../../converters/registry.js";
import type { ConversionRule } from "../../rules/types.js";

export async function renderRules(root: HTMLElement): Promise<void> {
  const rules = await send<ConversionRule[]>({ type: "getRules" });

  root.innerHTML = `
    <h1>Rules</h1>
    <p class="view-subtitle">Automatic conversion rules, evaluated in priority order (lowest number first).</p>

    <div class="card" id="formCard"></div>

    <div class="card">
      <div class="toolbar"><h2 style="margin:0">All rules (${rules.length})</h2></div>
      ${
        rules.length === 0
          ? `<div class="empty-state"><strong>No rules yet</strong>Create your first rule above, e.g. .txt \u2192 pdf.</div>`
          : `<table>
              <thead><tr><th></th><th>Name</th><th>When</th><th>Then</th><th>Save to</th><th>Priority</th><th></th></tr></thead>
              <tbody>${rules.map(ruleRow).join("")}</tbody>
            </table>`
      }
    </div>
  `;

  renderForm(root.querySelector("#formCard") as HTMLElement, rules, null);
  wireRuleActions(root, rules);
}

function ruleRow(r: ConversionRule): string {
  const whenLabel = r.sourceExtension.startsWith("[") && r.sourceExtension.endsWith("]")
    ? `All ${r.sourceExtension.slice(1, -1)}`
    : (r.sourceExtension === "youtube" ? "YouTube Link" : `.${r.sourceExtension}`);
  return `<tr class="rule-row ${r.enabled ? "" : "disabled"}" data-id="${r.id}">
    <td><label class="pill-toggle"><input type="checkbox" class="toggle-enabled" data-id="${r.id}" ${r.enabled ? "checked" : ""}><span class="track"></span></label></td>
    <td>${escapeHtml(r.name)}</td>
    <td class="mono">${escapeHtml(whenLabel)}</td>
    <td class="mono">${escapeHtml(r.targetFormat)}</td>
    <td>${outputLocationLabel(r)}</td>
    <td class="mono">${r.priority}</td>
    <td>
      <button class="btn btn-sm edit-rule" data-id="${r.id}">Edit</button>
      <button class="btn btn-sm danger delete-rule" data-id="${r.id}">Delete</button>
    </td>
  </tr>`;
}

function outputLocationLabel(r: ConversionRule): string {
  if (r.outputLocation === "same-folder") return "Same folder";
  if (r.outputLocation === "dedicated-folder") return `/${escapeHtml(r.dedicatedFolderName ?? "Converted")}`;
  return `/Converted/${escapeHtml(r.targetFormat.toUpperCase())}`;
}

function renderForm(container: HTMLElement, rules: ConversionRule[], editRuleId: string | null): void {
  const editing = editRuleId ? rules.find((r) => r.id === editRuleId) : null;
  const specialCategories = ["[images]", "[documents]", "[audio]", "[video]", "[data]"];
  const extensions = [...specialCategories, ...allSourceExtensions()];
  const currentExt = editing?.sourceExtension ?? extensions[0] ?? "txt";
  const targets = conversionsForSource(currentExt);
  const defaultName = editing?.name ?? (
    currentExt.startsWith("[") && currentExt.endsWith("]")
      ? `All ${currentExt.slice(1, -1).charAt(0).toUpperCase() + currentExt.slice(2, -1)} to ${targets[0]?.targetExt.toUpperCase() ?? ""}`
      : (currentExt === "youtube"
          ? `YouTube to ${targets[0]?.targetExt.toUpperCase() ?? ""}`
          : `${currentExt.toUpperCase()} to ${targets[0]?.targetExt.toUpperCase() ?? ""}`)
  );

  container.innerHTML = `
    <h2>${editing ? "Edit rule" : "Create a rule"}</h2>
    <form id="ruleForm">
      <div class="form-grid">
        <div class="form-field">
          <label for="f-name">Rule name</label>
          <input type="text" id="f-name" value="${escapeHtml(defaultName)}">
        </div>
        <div class="form-field">
          <label for="f-source">File type (WHEN)</label>
          <select id="f-source">${extensions.map((e) => {
            const label = e.startsWith("[") && e.endsWith("]")
              ? `All ${e.slice(1, -1)}`
              : (e === "youtube" ? "YouTube Link" : `.${e}`);
            return `<option value="${e}" ${e === currentExt ? "selected" : ""}>${label}</option>`;
          }).join("")}</select>
        </div>
        <div class="form-field">
          <label for="f-target">Convert to (DO)</label>
          <select id="f-target">${targets.map((t) => `<option value="${t.targetExt}" ${t.targetExt === editing?.targetFormat ? "selected" : ""}>${escapeHtml(t.label)}${t.requiresNativeHost ? " (needs " + t.requiredEngine + ")" : ""}</option>`).join("")}</select>
        </div>
        <div class="form-field">
          <label for="f-output">Save to</label>
          <select id="f-output">
            <option value="same-folder" ${editing?.outputLocation === "same-folder" ? "selected" : ""}>Same folder</option>
            <option value="dedicated-folder" ${editing?.outputLocation === "dedicated-folder" ? "selected" : ""}>Dedicated folder</option>
            <option value="per-format-folder" ${editing?.outputLocation === "per-format-folder" ? "selected" : ""}>Per-format folder</option>
          </select>
        </div>
        <div class="form-field">
          <label for="f-dedicated">Dedicated folder name</label>
          <input type="text" id="f-dedicated" value="${escapeHtml(editing?.dedicatedFolderName ?? "Converted")}">
        </div>
        <div class="form-field">
          <label for="f-original">Original file</label>
          <select id="f-original">
            <option value="keep" ${!editing?.deleteOriginal ? "selected" : ""}>Keep</option>
            <option value="delete" ${editing?.deleteOriginal ? "selected" : ""}>Delete after successful conversion</option>
          </select>
        </div>
        <div class="form-field">
          <label for="f-template">Filename template</label>
          <input type="text" id="f-template" value="${escapeHtml(editing?.filenameTemplate ?? "{name}.{extension}")}">
          <span class="field-hint">Variables: {name} {extension} {date} {time} {datetime} {timestamp} {counter}</span>
        </div>
        <div class="form-field">
          <label for="f-overwrite">If a file with that name exists</label>
          <select id="f-overwrite">
            <option value="rename" ${(editing?.overwriteBehavior ?? "rename") === "rename" ? "selected" : ""}>Add (1), (2)&hellip;</option>
            <option value="overwrite" ${editing?.overwriteBehavior === "overwrite" ? "selected" : ""}>Overwrite</option>
            <option value="skip" ${editing?.overwriteBehavior === "skip" ? "selected" : ""}>Skip conversion</option>
          </select>
        </div>
        <div class="form-field">
          <label for="f-maxsize">Maximum file size (MB, blank = no limit)</label>
          <input type="number" id="f-maxsize" min="0" value="${editing?.maxFileSizeBytes ? Math.round(editing.maxFileSizeBytes / (1024 * 1024)) : ""}">
        </div>
        <div class="form-field">
          <label for="f-priority">Priority (lower runs first)</label>
          <input type="number" id="f-priority" value="${editing?.priority ?? 100}">
        </div>
        <div class="form-field span-2">
          <div class="checkbox-row"><input type="checkbox" id="f-auto" ${(editing?.automaticConversion ?? true) ? "checked" : ""}><label for="f-auto">Convert automatically (uncheck to require manually starting each conversion)</label></div>
          <div class="checkbox-row"><input type="checkbox" id="f-notify-ok" ${(editing?.notifyOnSuccess ?? true) ? "checked" : ""}><label for="f-notify-ok">Notify on success</label></div>
          <div class="checkbox-row"><input type="checkbox" id="f-notify-fail" ${(editing?.notifyOnFailure ?? true) ? "checked" : ""}><label for="f-notify-fail">Notify on failure</label></div>
        </div>
      </div>
      <div class="form-errors" id="formErrors"></div>
      <div style="margin-top:14px;display:flex;gap:8px">
        <button type="submit" class="btn primary">${editing ? "Save changes" : "Create rule"}</button>
        ${editing ? `<button type="button" class="btn" id="cancelEdit">Cancel</button>` : ""}
      </div>
    </form>
  `;

  const sourceSelect = container.querySelector("#f-source") as HTMLSelectElement;
  const targetSelect = container.querySelector("#f-target") as HTMLSelectElement;
  sourceSelect.addEventListener("change", () => {
    const val = sourceSelect.value;
    const opts = conversionsForSource(val);
    targetSelect.innerHTML = opts
      .map((t) => `<option value="${t.targetExt}">${escapeHtml(t.label)}${t.requiresNativeHost ? " (needs " + t.requiredEngine + ")" : ""}</option>`)
      .join("");
    
    // Auto-update the rule name based on selected category or extension
    const nameInput = container.querySelector("#f-name") as HTMLInputElement;
    const newDefaultName = val.startsWith("[") && val.endsWith("]")
      ? `All ${val.slice(1, -1).charAt(0).toUpperCase() + val.slice(2, -1)} to ${opts[0]?.targetExt.toUpperCase() ?? ""}`
      : (val === "youtube"
          ? `YouTube to ${opts[0]?.targetExt.toUpperCase() ?? ""}`
          : `${val.toUpperCase()} to ${opts[0]?.targetExt.toUpperCase() ?? ""}`);
    nameInput.value = newDefaultName;
  });

  const outputSelect = container.querySelector("#f-output") as HTMLSelectElement;
  const dedicatedField = (container.querySelector("#f-dedicated") as HTMLInputElement).closest(".form-field") as HTMLElement;
  const syncDedicatedVisibility = () => {
    dedicatedField.style.display = outputSelect.value === "dedicated-folder" ? "" : "none";
  };
  outputSelect.addEventListener("change", syncDedicatedVisibility);
  syncDedicatedVisibility();

  container.querySelector("#cancelEdit")?.addEventListener("click", () => {
    void renderRules(container.closest(".content") as HTMLElement);
  });

  (container.querySelector("#ruleForm") as HTMLFormElement).addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = (id: string) => (container.querySelector(id) as HTMLInputElement | HTMLSelectElement).value;
    const maxSizeStr = q("#f-maxsize");
    const patch: Partial<ConversionRule> = {
      name: q("#f-name"),
      sourceExtension: q("#f-source"),
      targetFormat: q("#f-target"),
      outputLocation: q("#f-output") as ConversionRule["outputLocation"],
      dedicatedFolderName: q("#f-dedicated"),
      deleteOriginal: q("#f-original") === "delete",
      filenameTemplate: q("#f-template"),
      overwriteBehavior: q("#f-overwrite") as ConversionRule["overwriteBehavior"],
      maxFileSizeBytes: maxSizeStr ? Number(maxSizeStr) * 1024 * 1024 : null,
      priority: Number(q("#f-priority")),
      automaticConversion: (container.querySelector("#f-auto") as HTMLInputElement).checked,
      notifyOnSuccess: (container.querySelector("#f-notify-ok") as HTMLInputElement).checked,
      notifyOnFailure: (container.querySelector("#f-notify-fail") as HTMLInputElement).checked,
    };

    const result = editing
      ? await send<{ rule?: ConversionRule; errors: { field: string; message: string }[] }>({ type: "updateRule", id: editing.id, patch })
      : await send<{ rule?: ConversionRule; errors: { field: string; message: string }[] }>({ type: "addRule", rule: patch });

    const errBox = container.querySelector("#formErrors") as HTMLElement;
    if (result.errors.length) {
      errBox.textContent = result.errors.map((e) => e.message).join(" \u00b7 ");
      return;
    }
    void renderRules(container.closest(".content") as HTMLElement);
  });
}

function wireRuleActions(root: HTMLElement, rules: ConversionRule[]): void {
  root.querySelectorAll<HTMLInputElement>(".toggle-enabled").forEach((el) => {
    el.addEventListener("change", async () => {
      await send({ type: "updateRule", id: el.dataset.id, patch: { enabled: el.checked } });
      void renderRules(root);
    });
  });
  root.querySelectorAll<HTMLButtonElement>(".edit-rule").forEach((el) => {
    el.addEventListener("click", () => {
      renderForm(root.querySelector("#formCard") as HTMLElement, rules, el.dataset.id ?? null);
      (root.querySelector("#formCard") as HTMLElement).scrollIntoView({ behavior: "smooth" });
    });
  });
  root.querySelectorAll<HTMLButtonElement>(".delete-rule").forEach((el) => {
    el.addEventListener("click", async () => {
      if (!confirm("Delete this rule? This cannot be undone.")) return;
      await send({ type: "removeRule", id: el.dataset.id });
      void renderRules(root);
    });
  });
}
