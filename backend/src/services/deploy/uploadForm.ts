import type { CfWorkerInit, CfModuleType } from './types';

// 模块类型 → MIME 映射（对齐 wrangler moduleTypeMimeType）
const MODULE_MIME: Record<CfModuleType, string> = {
  'esm': 'application/javascript+module',
  'commonjs': 'application/javascript',
  'compiled-wasm': 'application/wasm',
  'text': 'text/plain',
  'buffer': 'application/octet-stream',
};

export interface MultipartBody {
  body: Buffer;
  contentType: string;
  /** 本次使用的 boundary；嵌套 multipart（如 Pages 的 _worker.js）需要它来声明内层类型 */
  boundary: string;
}

export interface MultipartPart {
  /** form-data 字段名 */
  name: string;
  /** 提供时以文件附件发送（Worker 模块与静态资源都是这种形式） */
  filename?: string;
  /** 省略时不写 Content-Type 行（对齐 undici 对纯字符串字段的序列化） */
  contentType?: string;
  content: string | Uint8Array | Buffer;
}

// 将 string / Uint8Array / Buffer 安全转换为独立 Buffer（拷贝，不共享底层内存）
function toBuffer(content: string | Uint8Array | Buffer): Buffer {
  if (typeof content === 'string') return Buffer.from(content, 'utf-8');
  // 必须拷贝，避免 Buffer/Uint8Array 视图共享底层 ArrayBuffer 导致 content-length 不匹配
  const copy = Buffer.alloc(content.byteLength);
  copy.set(content);
  return copy;
}

/**
 * 手动构建 multipart/form-data body（通用入口）。
 *
 * 不使用 FormData + undici 自动序列化，原因有两条：
 * 1. 请求走代理时 proxyFetch 会改用 node-fetch@2，而 node-fetch v2 无法序列化 undici 的
 *    FormData —— body 会退化成字符串 "[object FormData]"、Content-Type 声明为 text/plain，
 *    Cloudflare 直接以 415 code 10001（Content-Type must be one of ...）拒绝；
 * 2. undici 在计算 multipart Content-Length 时可能与实际 body 不一致（尤其当 Blob 部分由
 *    ArrayBuffer 支撑时），导致 Cloudflare API 返回截断响应 → UND_ERR_RES_CONTENT_LENGTH_MISMATCH。
 *
 * 手动构建可精确控制每个 part 的字节，Buffer.concat 后 Content-Length 完全确定。
 */
export function buildMultipartBody(parts: MultipartPart[]): MultipartBody {
  const boundary = '----formdata-cf-manager-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const chunks: Buffer[] = [];
  const CRLF = '\r\n';

  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}${CRLF}`));
    chunks.push(Buffer.from(part.filename === undefined
      ? `Content-Disposition: form-data; name="${part.name}"${CRLF}`
      : `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"${CRLF}`));
    if (part.contentType !== undefined) {
      chunks.push(Buffer.from(`Content-Type: ${part.contentType}${CRLF}`));
    }
    chunks.push(Buffer.from(CRLF));
    chunks.push(toBuffer(part.content));
    chunks.push(Buffer.from(CRLF));
  }

  // 结束边界
  chunks.push(Buffer.from(`--${boundary}--${CRLF}`));

  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}`, boundary };
}

/**
 * 构建 Worker 脚本上传的 multipart body（metadata + 模块 + source maps）。
 */
export function createWorkerUploadForm(
  worker: CfWorkerInit,
  bindings: Record<string, unknown>[] | undefined,
): MultipartBody {
  // 1. 构建 metadata
  const metadataBindings = bindings || [];
  const metadata: Record<string, unknown> = {
    main_module: worker.main.name,
    compatibility_date: worker.compatibility_date,
    bindings: metadataBindings,
  };
  // 仅在非空时发送 compatibility_flags（对标 wrangler：空数组不发送）
  if (worker.compatibility_flags?.length) metadata.compatibility_flags = worker.compatibility_flags;

  if (worker.migrations?.length) metadata.migrations = worker.migrations;
  if (worker.keepVars) metadata.keep_vars = true;
  if (worker.keepSecrets) metadata.keep_secrets = true;
  // keep_bindings: CF API 期望 []string（要保留的绑定类型列表），不是 boolean
  if (worker.keepBindings) {
    metadata.keep_bindings = [
      'kv_namespace', 'd1', 'r2_bucket',
      'service', 'queue', 'durable_object_namespace',
      'ai', 'assets', 'secret_text', 'plain_text',
    ];
  }
  if (worker.placement) metadata.placement = worker.placement;
  if (worker.tail_consumers?.length) metadata.tail_consumers = worker.tail_consumers;
  if (worker.limits) metadata.limits = worker.limits;
  if (worker.logpush !== undefined) metadata.logpush = worker.logpush;
  if (worker.assets) metadata.assets = worker.assets;
  if (worker.observability) metadata.observability = worker.observability;

  // 2. 组装各 part：metadata → 主模块 → 附加模块 → source maps
  const parts: MultipartPart[] = [
    { name: 'metadata', contentType: 'application/json', content: JSON.stringify(metadata) },
    { name: worker.main.name, filename: worker.main.name, contentType: MODULE_MIME[worker.main.type], content: worker.main.content },
  ];
  for (const mod of worker.modules) {
    parts.push({ name: mod.name, filename: mod.name, contentType: MODULE_MIME[mod.type], content: mod.content });
  }
  for (const sm of worker.sourceMaps) {
    parts.push({ name: sm.name, filename: sm.name, contentType: 'application/json', content: sm.content });
  }

  return buildMultipartBody(parts);
}
