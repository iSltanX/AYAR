// data.purge (14.3 «مسح كل البيانات», DEV-12): what AYAR keeps about the projects and what it fetched — every project
// with its runs, evidence, snapshots and reference images (by project.remove's own path), the managed tools, the
// probe's browser and the offline vulnerability databases, the database backups and the logs. The settings and the
// HMAC key stay, and no repository is touched. The UI confirms twice and the main process issues the token once.
// Refused while a run is active or waiting, or a setup action runs.
import { join } from 'node:path';
import type { CommandHandler } from '../host/dispatcher.ts';
import { CommandError } from '../host/errors.ts';
import { newId } from '../host/ids.ts';
import { recordAudit } from '../storage/audit.ts';
import { DIR_MODE } from '../storage/data-dir.ts';

export const dataPurge: CommandHandler = async (_payload, ctx) => {
  const { services, db, ports } = ctx;
  if (services.setup.hasActive()) throw new CommandError('busy', { reason: 'setup_running' });
  const projects = db.all<{ id: string }>('SELECT id FROM projects').map((r) => r.id);
  if (projects.some((id) => services.runs.busy(id))) throw new CommandError('busy', { reason: 'run_active' });
  for (const id of projects) {
    await services.projects.remove(id);
    await services.evidence.afterProjectRemoved(id);
    await services.baselines.removeProject(id);
  }
  const layout = services.layout;
  // The fetched tools and assets, and the copies of the database that still hold the projects.
  const folders = [layout.tools, layout.browsers, layout.osvDb, layout.backups, layout.logs, layout.baselines];
  for (const dir of folders) for (const name of await ports.fs.readdir(dir).catch(() => [] as string[])) await ports.fs.remove(join(dir, name));
  for (const dir of folders) {
    await ports.fs.mkdir(dir, DIR_MODE);
    await ports.fs.chmod(dir, DIR_MODE);
  }
  db.transaction(() => {
    db.run('DELETE FROM tools');
    db.run('DELETE FROM data_assets');
    db.run('DELETE FROM audit_log');
    recordAudit(db, { id: newId(ports.random, 'aud'), at: ports.clock.now(), action: 'data.purged', projectId: null, details: { projects: projects.length } });
  });
  return { purged: true, projects: projects.length };
};
