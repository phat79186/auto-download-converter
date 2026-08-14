import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import type { EngineInfo, EngineName } from "../types.js";

const execFileAsync = promisify(execFile);

interface EngineProbe {
  engine: EngineName;
  /** Default executable names to try, in order, when no configured path is given. */
  candidates: string[];
  versionArgs: string[];
  /** Extract a human-readable version string from combined stdout+stderr. */
  parseVersion: (output: string) => string | null;
}

const PROBES: EngineProbe[] = [
  {
    engine: "ffmpeg",
    candidates: process.platform === "win32"
      ? [
          "ffmpeg.exe",
          "ffmpeg",
          "C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe"
        ]
      : ["ffmpeg"],
    versionArgs: ["-version"],
    parseVersion: (out) => /ffmpeg version (\S+)/.exec(out)?.[1] ?? null,
  },
  {
    engine: "pandoc",
    candidates: process.platform === "win32"
      ? [
          "pandoc.exe",
          "pandoc",
          "C:\\Program Files\\Pandoc\\pandoc.exe",
          "C:\\Program Files (x86)\\Pandoc\\pandoc.exe",
          ...(process.env.LOCALAPPDATA ? [path.join(process.env.LOCALAPPDATA, "Pandoc\\pandoc.exe")] : []),
          ...(process.env.APPDATA ? [path.join(process.env.APPDATA, "Local\\Pandoc\\pandoc.exe")] : [])
        ]
      : ["pandoc"],
    versionArgs: ["--version"],
    parseVersion: (out) => /pandoc(?:\.exe)? (\S+)/.exec(out)?.[1] ?? /pandoc\s+(\d+\.\d+(\.\d+)?)/.exec(out)?.[1] ?? null,
  },
  {
    engine: "libreoffice",
    candidates: process.platform === "win32"
      ? [
          "soffice.com",
          "soffice.exe",
          "soffice",
          "C:\\Program Files\\LibreOffice\\program\\soffice.com",
          "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
          "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com",
          "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe"
        ]
      : ["soffice", "libreoffice"],
    versionArgs: ["--version"],
    parseVersion: (out) => /LibreOffice\s+(\S+)/.exec(out)?.[1] ?? null,
  },
];

async function tryRun(exe: string, args: string[]): Promise<{ stdout: string; stderr: string } | null> {
  try {
    const { stdout, stderr } = await execFileAsync(exe, args, { timeout: 8000, windowsHide: true });
    return { stdout, stderr };
  } catch (err) {
    // ENOENT => not found. Other errors (e.g. non-zero exit) still might carry version text on some platforms,
    // but we treat any failure as "not usable" to be conservative.
    return null;
  }
}

export async function detectEngine(engine: EngineName, configuredPath?: string): Promise<EngineInfo> {
  const probe = PROBES.find((p) => p.engine === engine)!;
  // If the user explicitly configured a path (Settings), only try that path -
  // silently falling back to a different PATH-discovered binary would be
  // confusing ("why is it using a different version than I configured?").
  const candidates = configuredPath ? [configuredPath] : probe.candidates;

  for (const exe of candidates) {
    const result = await tryRun(exe, probe.versionArgs);
    if (!result) continue;
    const combined = `${result.stdout}\n${result.stderr}`;
    const version = probe.parseVersion(combined);
    return {
      engine,
      installed: true,
      version: version ?? "unknown",
      path: exe,
    };
  }

  return {
    engine,
    installed: false,
    version: null,
    path: null,
    error: `${engine} was not found on PATH${configuredPath ? ` or at configured path "${configuredPath}"` : ""}`,
  };
}

export async function detectAllEngines(configuredPaths?: Partial<Record<EngineName, string>>): Promise<EngineInfo[]> {
  return Promise.all(
    (["ffmpeg", "pandoc", "libreoffice"] as EngineName[]).map((e) => detectEngine(e, configuredPaths?.[e]))
  );
}
