import { Router, Request, Response } from 'express';
import pricingData from '../data/model-pricing.json';

// new-api ratio sync 基准：1 ratio unit = $0.002 / 1K tokens
// CF 1 Neuron = $0.000011
// 因此 model_ratio = neurons_per_1k * 0.000011 / 0.002 = neurons_per_1k * 0.0055
const NEURON_TO_RATIO = 0.0055;

interface PricingItem {
  model_name: string;
  quota_type: number;          // 0=ratio, 1=price, 2=image
  model_ratio: number;
  completion_ratio: number;
  model_price: number;
  cache_ratio?: number;
  image_ratio?: number;
  audio_ratio?: number;
  audio_completion_ratio?: number;
}

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const models = pricingData.models as Record<string, any>;
  const items: PricingItem[] = [];
  for (const [modelName, rate] of Object.entries(models)) {
    const item = buildPricingItem(modelName, rate);
    if (item) items.push(item);
  }
  res.json({ success: true, data: items });
});

function buildPricingItem(modelName: string, rate: any): PricingItem | null {
  // 文本模型（input/output）
  if (rate.input !== undefined) {
    const inputRate = rate.input as number;
    const outputRate = (rate.output as number) || 0;
    const item: PricingItem = {
      model_name: modelName,
      quota_type: 0,
      model_ratio: round(inputRate * NEURON_TO_RATIO),
      completion_ratio: inputRate > 0 ? round(outputRate / inputRate) : 1,
      model_price: 0,
    };
    if (rate.cachedInput !== undefined) {
      item.cache_ratio = round((rate.cachedInput as number) / inputRate);
    }
    return item;
  }

  // 图像模型（perImage）
  if (rate.perImage !== undefined) {
    return {
      model_name: modelName,
      quota_type: 2,
      model_ratio: 0,
      completion_ratio: 1,
      model_price: 0,
      image_ratio: round((rate.perImage as number) * NEURON_TO_RATIO),
    };
  }

  // TTS 模型（perKChar）
  if (rate.perKChar !== undefined) {
    return {
      model_name: modelName,
      quota_type: 1,
      model_ratio: 0,
      completion_ratio: 1,
      model_price: round((rate.perKChar as number) * 0.000011, 8),
    };
  }

  // ASR 音频模型（perAudioMinute）
  if (rate.perAudioMinute !== undefined) {
    return {
      model_name: modelName,
      quota_type: 1,
      model_ratio: 0,
      completion_ratio: 1,
      model_price: round((rate.perAudioMinute as number) * 0.000011, 8),
    };
  }

  return null;
}

function round(v: number, digits = 6): number {
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}

export default router;
