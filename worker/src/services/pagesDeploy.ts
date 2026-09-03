import type { Account } from '../db/models';
import { cfFetch } from './cfApi';
import { extractZipFiles } from './staticAssets';
export { extractZipFiles };

// Pages 项目名称校验：Cloudflare 要求 ^[a-z0-9][a-z0-9-]*$
export function validatePagesProjectName(name: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(name);
}

// 确保 Pages 项目存在，已存在时忽略 409 错误
export async function ensurePagesProject(account: Account, encryptionKey: string, name: string): Promise<void> {
  try {
    await cfFetch(account, `/accounts/${account.account_id}/pages/projects`, encryptionKey, {
      method: 'POST',
      body: JSON.stringify({ name, production_branch: 'main' }),
    });
  } catch (e: any) {
    if (!e.body?.includes('already exists') && e.status !== 409) throw e;
  }
}

// ============ Pages 部署：wrangler 四步上传法 ============
export interface DeployPageFile { path: string; buffer: Uint8Array; }

export interface DeployPagesOptions {
  skipCreateProject?: boolean;
  productionBranch?: string;
  branch?: string;
  commitMessage?: string;
}
