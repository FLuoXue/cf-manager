// NOTE: model-pricing.json 是自动生成的，唯一真实来源在 shared/model-pricing.json
// 修改定价请编辑 shared/model-pricing.json，然后运行 npm run build 或 node scripts/sync-shared.js
import pricingData from '../data/model-pricing.json';

function getModelRate(model: string): any {
  if (!model) return undefined;
  const models = pricingData.models as Record<string, any>;
  if (models[model]) return models[model];
  if (models[`@cf/${model}`]) return models[`@cf/${model}`];
  const withoutPrefix = model.replace(/^@cf\//, '');
  for (const [key, value] of Object.entries(models)) {
    if (key === withoutPrefix || key.endsWith('/' + withoutPrefix) || key.replace(/^@cf\//, '') === withoutPrefix) {
      return value;
    }
  }
  return undefined;
}

export function estimateNeurons(
  model: string,
  promptTokens: number,
  completionTokens: number,
  cachedTokens?: number
): number {
  promptTokens = promptTokens || 0;
  completionTokens = completionTokens || 0;
  const cached = cachedTokens || 0;
  const rate = (getModelRate(model) ?? pricingData.default) as any;
  const normalInput = Math.max(0, promptTokens - cached);
  const cachedInputRate = rate.cachedInput ?? rate.input;
  const neurons = (normalInput / 1000) * rate.input
                + (cached / 1000) * cachedInputRate
                + (completionTokens / 1000) * rate.output;
  return Math.max(1, Math.round(neurons));
}

/** 图片生成模型的神经元消耗估算（按每张图片计费） */
export function estimateImageNeurons(model: string): number {
  const rate = getModelRate(model) as any;
  if (rate?.perImage) return rate.perImage;
  return (pricingData as any).defaultImage?.perImage ?? 1338;
}

/** TTS 模型的神经元消耗估算（按字符数或音频分钟计费） */
export function estimateTtsNeurons(text: string, model: string): number {
  const rate = getModelRate(model) as any;
  const charCount = text.length;
  // 官方音频类模型按音频分钟计费（perAudioMinute = 每音频分钟的 Neurons，即 官方 $/音频分钟 × 90909.09）；按 ~900 字符/分钟 由文本长度折算分钟数
  if (rate?.perAudioMinute) {
    const CHARS_PER_AUDIO_MINUTE = 900;
    const minutes = charCount / CHARS_PER_AUDIO_MINUTE;
    return Math.max(1, Math.round(minutes * rate.perAudioMinute));
  }
  const perKChar = rate?.perKChar ?? (pricingData as any).defaultTts?.perKChar ?? 30;
  return Math.max(1, Math.round((charCount / 1000) * perKChar));
}

/** ASR 语音识别模型的神经元消耗估算（按音频分钟计费，由音频字节数近似时长） */
export function estimateAsrNeurons(audioBytes: number, model: string): number {
  const rate = (getModelRate(model) as any) ?? (pricingData as any).default;
  const perAudioMinute = rate?.perAudioMinute ?? (pricingData as any).defaultAudio?.perAudioMinute ?? 45;
  // 由音频字节数近似时长：假设 ~128kbps（≈16,000 字节/秒，≈960,000 字节/分钟）
  const BYTES_PER_AUDIO_MINUTE = 960000;
  const minutes = (audioBytes || 0) / BYTES_PER_AUDIO_MINUTE;
  return Math.max(1, Math.round(minutes * perAudioMinute));
}

/** 翻译模型的神经元消耗估算（按字符数计费） */
export function estimateTranslationNeurons(text: string, model: string): number {
  const charCount = text.length;
  // 翻译模型的定价是按 1000 字符计费，输入和输出价格相同（模型输出翻译文本）
  // CF 翻译模型返回完整翻译文本，按总字符数（输入+输出）计算
  // 为简化，按输入字符数的 2 倍估算（输入 + 输出各约相同长度）
  const rate = (pricingData.models[model as keyof typeof pricingData.models] as any);
  const inputRate = rate?.input ?? (pricingData as any).default?.input ?? 30;
  const outputRate = rate?.output ?? (pricingData as any).default?.output ?? 30;
  // 假设输出和输入长度相近
  const neurons = (charCount / 1000) * (inputRate + outputRate);
  return Math.max(1, Math.round(neurons));
}

/** 文本嵌入（Embeddings）模型的神经元消耗估算（按 token 数计费，input 费率为每 1000 token） */
export function estimateEmbeddingsNeurons(model: string, inputTexts: string[]): number {
  const texts = Array.isArray(inputTexts) ? inputTexts : [String(inputTexts ?? '')];
  const rate = (getModelRate(model) as any) || (pricingData as any).default;
  const inputRate = rate?.input ?? (pricingData as any).default?.input ?? 30;
  // 粗略估算：1 token ≈ 4 字符
  const estTokens = texts.reduce((sum, t) => sum + Math.ceil((t?.length || 0) / 4), 0);
  return Math.max(1, Math.round((estTokens / 1000) * inputRate));
}
