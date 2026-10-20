import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type {
  FieldLogAppendResult,
  FieldLogEntry,
  FieldLogInfo
} from '../shared/fieldLog'
import { FIELD_LOG_SCHEMA_VERSION } from '../shared/fieldLog'

const ALLOWED_TYPES = new Set(['session', 'shot', 'analyze-error', 'match-end'])
const MAX_ENTRY_BYTES = 256 * 1024

function dateStamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
}

/**
 * Append-only local JSONL log for field tests. Writes are serialised so shots
 * cannot interleave, and each entry is one line so the file can be tailed or
 * converted to CSV later. No images are ever written.
 */
export class FieldLog {
  private readonly dir: string
  private queue: Promise<void> = Promise.resolve()

  constructor(baseDir?: string) {
    this.dir = baseDir ?? path.join(app.getPath('userData'), 'field-logs')
  }

  getDirectory(): string {
    return this.dir
  }

  getCurrentFile(date = new Date()): string {
    return path.join(this.dir, `field-${dateStamp(date)}.jsonl`)
  }

  async info(): Promise<FieldLogInfo> {
    return { directory: this.dir, file: this.getCurrentFile() }
  }

  async ensureDirectory(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
  }

  async append(entry: unknown): Promise<FieldLogAppendResult> {
    const candidate = entry as Partial<FieldLogEntry> | null
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return { ok: false, error: '日志条目必须是对象' }
    }
    if (
      typeof candidate.type !== 'string' ||
      !ALLOWED_TYPES.has(candidate.type)
    ) {
      return { ok: false, error: '未知的日志条目类型' }
    }
    if (candidate.schemaVersion !== FIELD_LOG_SCHEMA_VERSION) {
      return { ok: false, error: '日志条目版本不兼容' }
    }

    let line: string
    try {
      line = JSON.stringify(entry)
    } catch {
      return { ok: false, error: '日志条目无法序列化' }
    }
    if (Buffer.byteLength(line, 'utf8') > MAX_ENTRY_BYTES) {
      return { ok: false, error: '日志条目过大' }
    }

    const file = this.getCurrentFile()
    // Chain the write after all previous writes; a failed write must not
    // poison the queue for later shots.
    const task = this.queue.then(async () => {
      await fs.mkdir(this.dir, { recursive: true })
      await fs.appendFile(file, `${line}\n`, 'utf8')
    })
    this.queue = task.catch(() => undefined)

    try {
      await task
      return { ok: true, path: file }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : '写入场地测试日志失败'
      }
    }
  }
}
