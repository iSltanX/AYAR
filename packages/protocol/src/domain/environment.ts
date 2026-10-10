// The ResolvedEnv contract (C-07, D-06, D-47, FR-14, FR-15, protocol 1.1): where the environment came from (the
// login shell, or the marked fallback), the PATH, the variable names (never their values), which sensitive
// variables are withheld from checks, the tools of the project with their versions and sources, mismatches
// against what the project asks for, and the matching version found in a version manager's folder.
import { IsoTimestamp } from '../common.ts';
import { z } from '../zod.ts';

export const EnvSource = z.enum(['login_shell', 'fallback']);
export type EnvSource = z.infer<typeof EnvSource>;

export const ToolResolution = z.strictObject({
  tool: z.string(),
  /** Found on the computed PATH (C-07 point 3, with the project folder as the working directory for shims). */
  path: z.string().nullable(),
  realPath: z.string().nullable(),
  /** pnpm or yarn as a corepack shim (G-DEV2-01): it may download the declared manager unless the network is off. */
  viaCorepack: z.boolean(),
  /** The tool is a shell function in the login shell (nvm's lazy loading, G-49): the terminal may use another version. */
  shellFunction: z.boolean(),
  version: z.string().nullable(),
  versionSource: z.enum(['path', 'manager-folder', 'probe', 'venv']).nullable(),
  required: z.strictObject({ spec: z.string(), from: z.string() }).nullable(),
  satisfies: z.boolean().nullable(),
  /** Versions installed in version managers' folders, read without running them (E-07). */
  installed: z.array(z.strictObject({ version: z.string(), manager: z.string(), path: z.string() })),
  /** A matching installed version proposed explicitly when the PATH one does not satisfy (enters the approval). */
  proposedPath: z.string().nullable(),
  /** For nvm: the version a terminal gets through `nvm alias default`, read from files (G-49). */
  terminalVersion: z.string().nullable(),
  status: z.enum(['ok', 'mismatch', 'missing', 'unknown']),
  probe: z
    .strictObject({ ok: z.boolean(), version: z.string().nullable(), durationMs: z.int().nonnegative(), error: z.string().nullable() })
    .nullable(),
});
export type ToolResolution = z.infer<typeof ToolResolution>;

export const ResolvedEnv = z.strictObject({
  source: EnvSource,
  /** Why the fallback was used: timeout, a failed shell, missing markers. */
  fallbackReason: z.string().nullable(),
  shell: z.string(),
  resolvedAt: IsoTimestamp,
  durationMs: z.int().nonnegative(),
  path: z.array(z.string()),
  lang: z.string().nullable(),
  /** Every variable name of the login environment (values never leave the engine). */
  names: z.array(z.string()),
  /** D-47: sensitive variables, by name, not passed to checks unless the profile allows them. */
  withheld: z.array(z.string()),
  /** G-35: names that match a sensitive word but are passed, with why (SSH_AUTH_SOCK, TERM_SESSION_ID). */
  exceptions: z.array(z.strictObject({ name: z.string(), reason: z.string() })),
  /** Electron's and AYAR's own variables, always removed. */
  removedInternal: z.array(z.string()),
  tools: z.array(ToolResolution),
});
export type ResolvedEnv = z.infer<typeof ResolvedEnv>;

/** The environment one check instance would get (C-07 point 5): names only. */
export const ChildEnvSummary = z.strictObject({
  instance: z.string(),
  passed: z.array(z.string()),
  withheld: z.array(z.string()),
  allowedSensitive: z.array(z.string()),
  added: z.array(z.string()),
  removedInternal: z.array(z.string()),
});
export type ChildEnvSummary = z.infer<typeof ChildEnvSummary>;
