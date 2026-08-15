import { describe, it, expect } from "vitest";
import { buildJobPaths } from "../src/background/jobBuilder.js";
import { createDefaultRule } from "../src/rules/types.js";

describe("buildJobPaths", () => {
  it("same-folder: places output beside the source with the rendered filename", async () => {
    const rule = createDefaultRule({ outputLocation: "same-folder", filenameTemplate: "{name}.{extension}", targetFormat: "pdf" });
    const result = await buildJobPaths("/home/me/Downloads/report.txt", rule, async () => false);
    expect(result.skipped).toBe(false);
    expect(result.outputPath).toBe("/home/me/Downloads/report.pdf");
    expect(result.relativeSubpath).toBe("report.pdf");
  });

  it("dedicated-folder: places output in the configured subfolder", async () => {
    const rule = createDefaultRule({ outputLocation: "dedicated-folder", dedicatedFolderName: "Converted", targetFormat: "pdf" });
    const result = await buildJobPaths("/home/me/Downloads/report.txt", rule, async () => false);
    expect(result.outputPath).toBe("/home/me/Downloads/Converted/report.pdf");
    expect(result.relativeSubpath).toBe("Converted/report.pdf");
  });

  it("per-format-folder: places output in Converted/<FORMAT>/", async () => {
    const rule = createDefaultRule({ outputLocation: "per-format-folder", targetFormat: "pdf" });
    const result = await buildJobPaths("/home/me/Downloads/report.txt", rule, async () => false);
    expect(result.outputPath).toBe("/home/me/Downloads/Converted/PDF/report.pdf");
    expect(result.relativeSubpath).toBe("Converted/PDF/report.pdf");
  });

  it("relativeSubpath always uses forward slashes, even for a Windows backslash source path", async () => {
    const rule = createDefaultRule({ outputLocation: "dedicated-folder", dedicatedFolderName: "Converted", targetFormat: "pdf" });
    const result = await buildJobPaths("C:\\Users\\me\\Downloads\\report.txt", rule, async () => false);
    expect(result.relativeSubpath).toBe("Converted/report.pdf");
    expect(result.relativeSubpath).not.toContain("\\");
  });

  it("preserves Windows backslash paths", async () => {
    const rule = createDefaultRule({ outputLocation: "same-folder", targetFormat: "pdf" });
    const result = await buildJobPaths("C:\\Users\\me\\Downloads\\report.txt", rule, async () => false);
    expect(result.outputPath).toBe("C:\\Users\\me\\Downloads\\report.pdf");
  });

  it("overwriteBehavior=rename appends (1), (2)... on collision", async () => {
    const rule = createDefaultRule({ outputLocation: "same-folder", targetFormat: "pdf", overwriteBehavior: "rename" });
    const taken = new Set(["/d/report.pdf", "/d/report (1).pdf"]);
    const result = await buildJobPaths("/d/report.txt", rule, async (p) => taken.has(p));
    expect(result.outputPath).toBe("/d/report (2).pdf");
  });

  it("overwriteBehavior=overwrite always returns the plain desired path, even if it exists", async () => {
    const rule = createDefaultRule({ outputLocation: "same-folder", targetFormat: "pdf", overwriteBehavior: "overwrite" });
    const result = await buildJobPaths("/d/report.txt", rule, async () => true);
    expect(result.outputPath).toBe("/d/report.pdf");
    expect(result.skipped).toBe(false);
  });

  it("overwriteBehavior=skip marks the job skipped if the target already exists", async () => {
    const rule = createDefaultRule({ outputLocation: "same-folder", targetFormat: "pdf", overwriteBehavior: "skip" });
    const result = await buildJobPaths("/d/report.txt", rule, async () => true);
    expect(result.skipped).toBe(true);
    expect(result.outputPath).toBeUndefined();
  });

  it("applies a custom filename template", async () => {
    const rule = createDefaultRule({ outputLocation: "same-folder", targetFormat: "pdf", filenameTemplate: "{name}_converted.{extension}" });
    const result = await buildJobPaths("/d/report.txt", rule, async () => false);
    expect(result.outputFilename).toBe("report_converted.pdf");
  });
});
