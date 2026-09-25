// Video model catalog for the studio: the SFW video models RelayDance exposes on
// /v1/video/generations, with the same pre-charge formula the RelayDance
// playground shows before submit. Seedance bills per video token
// (duration x W x H x 24 fps / 1024) at a USD-per-million rate, MiniMax bills
// per output second; both get the 1.25 retail markup. RelayDance pre-charges
// the cap on submit and settles to actual output, failed tasks are refunded.
// This file is shared by the browser and the server, so it has no node imports.

export type Resolution = '480p' | '720p' | '768p' | '1080p' | '2k' | '4k'
export type Ratio = '9:16' | '16:9' | '1:1' | '4:3' | '3:4'
export type Spec = { model: string; resolution: Resolution; duration: number; ratio: Ratio }

export type VideoModel = {
  id: string
  label: string
  /** short note, translated through i18n */
  note: string
  family: 'seedance' | 'minimax'
  resolutions: Resolution[]
  minDuration: number
  maxDuration: number
  /** accepts asset:// reference images, so a virtual talent can be attached */
  talent: boolean
  /** USD per million tokens by resolution (seedance) */
  ratePerM?: Partial<Record<Resolution, number>>
  /** USD per output second (minimax) */
  perSecond?: number
  /** the SKU actually submitted for a resolution */
  sku: (r: Resolution) => string
}

export const RETAIL_MARKUP = 1.25
export const RATIOS: Ratio[] = ['9:16', '16:9', '1:1', '4:3', '3:4']
const DURATION_STEPS = [4, 5, 6, 8, 10, 12, 15, 20, 25, 30]

const DIMS: Record<Resolution, [number, number]> = {
  '480p': [854, 480],
  '720p': [1280, 720],
  '768p': [1366, 768],
  '1080p': [1920, 1080],
  '2k': [2560, 1440],
  '4k': [3840, 2160],
}

export const MODELS: VideoModel[] = [
  {
    id: 'seedance-2-0-mini',
    label: 'Seedance 2.0 Mini',
    note: 'low cost, up to 720p',
    family: 'seedance',
    resolutions: ['480p', '720p'],
    minDuration: 5,
    maxDuration: 15,
    talent: true,
    ratePerM: { '480p': 3.5, '720p': 3.5 },
    sku: (r) => (r === '720p' ? 'doubao-seedance-2-0-mini-720p' : 'doubao-seedance-2-0-mini-480p'),
  },
  {
    id: 'seedance-2-0-fast',
    label: 'Seedance 2.0 Fast',
    note: 'speed first, up to 720p',
    family: 'seedance',
    resolutions: ['480p', '720p'],
    minDuration: 5,
    maxDuration: 15,
    talent: true,
    ratePerM: { '480p': 5.6, '720p': 5.6 },
    sku: () => 'doubao-seedance-2-0-fast-260128',
  },
  {
    id: 'seedance-2-0-pro',
    label: 'Seedance 2.0 Pro',
    note: 'top quality, 1080p and 4K',
    family: 'seedance',
    resolutions: ['480p', '720p', '1080p', '4k'],
    minDuration: 5,
    maxDuration: 15,
    talent: true,
    ratePerM: { '480p': 7.0, '720p': 7.0, '1080p': 7.7, '4k': 4.0 },
    sku: (r) =>
      ({ '4k': 'doubao-seedance-2-0-4k', '1080p': 'doubao-seedance-2-0-1080p', '720p': 'doubao-seedance-2-0-720p' })[r as string] ??
      'doubao-seedance-2-0-480p',
  },
  {
    id: 'seedance-2-5',
    label: 'Seedance 2.5',
    note: 'newest flagship, up to 30 s',
    family: 'seedance',
    resolutions: ['480p', '720p'],
    minDuration: 5,
    maxDuration: 30,
    talent: true,
    ratePerM: { '480p': 10.7, '720p': 10.7 },
    sku: (r) => (r === '720p' ? 'doubao-seedance-2-5-720p' : 'doubao-seedance-2-5-480p'),
  },
  {
    id: 'seedance-1-5-pro',
    label: 'Seedance 1.5 Pro',
    note: 'previous generation, cheapest per second',
    family: 'seedance',
    resolutions: ['480p', '720p'],
    minDuration: 5,
    maxDuration: 15,
    talent: true,
    ratePerM: { '480p': 1.2, '720p': 1.2 },
    sku: () => 'seedance-1-5-pro-no-audio',
  },
  {
    id: 'minimax-h3-768p',
    label: 'MiniMax H3 768P',
    note: 'native stereo audio, billed per second, no virtual talent',
    family: 'minimax',
    resolutions: ['768p'],
    minDuration: 4,
    maxDuration: 15,
    talent: false,
    perSecond: 0.08,
    sku: () => 'minimax-h3-768p',
  },
  {
    id: 'minimax-h3-2k',
    label: 'MiniMax H3 2K',
    note: 'highest MiniMax quality, billed per second, no virtual talent',
    family: 'minimax',
    resolutions: ['2k'],
    minDuration: 4,
    maxDuration: 15,
    talent: false,
    perSecond: 0.13,
    sku: () => 'minimax-h3-2k',
  },
]

export const DEFAULT_SPEC: Spec = { model: 'seedance-2-0-mini', resolution: '720p', duration: 5, ratio: '9:16' }

export function modelById(id: string): VideoModel | undefined {
  return MODELS.find((m) => m.id === id)
}

export function durationsFor(m: VideoModel): number[] {
  return DURATION_STEPS.filter((d) => d >= m.minDuration && d <= m.maxDuration)
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Pre-charge estimate in USD for one render of this spec (retail, cap). */
export function estimateUsd(spec: Spec): number {
  const m = modelById(spec.model)
  if (!m) return 0
  if (m.perSecond) return round2(spec.duration * m.perSecond * RETAIL_MARKUP)
  const [w, h] = DIMS[spec.resolution]
  const tokens = (spec.duration * w * h * 24) / 1024
  const rate = m.ratePerM?.[spec.resolution] ?? 0
  return round2(((tokens * rate) / 1_000_000) * RETAIL_MARKUP)
}

/** Coerce arbitrary input into a valid spec: unknown model falls back to the default, resolution and duration are clamped to the model. */
export function normalizeSpec(input: unknown): Spec {
  const i = (input && typeof input === 'object' ? input : {}) as Partial<Spec>
  const m = modelById(String(i.model ?? '')) ?? modelById(DEFAULT_SPEC.model)!
  const resolution = m.resolutions.includes(i.resolution as Resolution) ? (i.resolution as Resolution) : m.resolutions[m.resolutions.length - 1]
  const wanted = Number(i.duration)
  const duration = Number.isFinite(wanted) ? Math.min(m.maxDuration, Math.max(m.minDuration, Math.round(wanted))) : Math.max(m.minDuration, 5)
  const ratio = RATIOS.includes(i.ratio as Ratio) ? (i.ratio as Ratio) : DEFAULT_SPEC.ratio
  return { model: m.id, resolution, duration, ratio }
}

export function specLabel(spec: Spec): string {
  const m = modelById(spec.model)
  return `${m?.label ?? spec.model} / ${spec.resolution} / ${spec.duration}s / ${spec.ratio}`
}

/** CSS aspect-ratio value for a ratio string */
export function ratioCss(ratio: Ratio | undefined): string {
  return (ratio ?? '9:16').replace(':', ' / ')
}
