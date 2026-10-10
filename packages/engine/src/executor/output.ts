// C-12 point 5: a check's output stream → C-18 (line by line, with the carry buffer) → its log file, at most 50 MB
// per stream and then a truncation mark, and at the same time → the live counters and the last lines (9.7: the
// last 200 lines are kept for the timeout and cancel screens) → check.log references, rate-limited by the bus.
// Nothing is written before C-18 has seen it.
import type { FileWriter } from '../ports/index.ts';
import type { LineRedactor, RedactionCounts } from '../redaction/redactor.ts';

export const LOG_LIMIT_BYTES = 50 * 1024 * 1024;
export const TAIL_LINES = 200;
export const TRUNCATION_MARK = '\n⟦output truncated: the log reached its 50 MB limit⟧\n';

export interface StreamSink {
  push(chunk: Uint8Array): void;
  /** Flushes the last partial line and closes the file. */
  end(): Promise<{ bytes: number; truncated: boolean; counts: RedactionCounts }>;
}

export interface OutputTotals {
  lines: number;
  tail: string[];
}

export function streamSink(o: {
  writer: FileWriter;
  redactor: LineRedactor;
  stream: 'stdout' | 'stderr';
  totals: OutputTotals;
  /** Reports a written segment (its offset and length in the log file) for check.log. */
  onSegment: (stream: 'stdout' | 'stderr', offset: number, length: number) => void;
  limit?: number;
}): StreamSink {
  const decoder = new TextDecoder('utf-8');
  const encoder = new TextEncoder();
  const limit = o.limit ?? LOG_LIMIT_BYTES;
  let bytes = 0;
  let truncated = false;
  const write = (lines: string[]) => {
    if (!lines.length) return;
    for (const l of lines) {
      o.totals.lines++;
      o.totals.tail.push(l.replace(/\n$/, ''));
    }
    if (o.totals.tail.length > TAIL_LINES) o.totals.tail.splice(0, o.totals.tail.length - TAIL_LINES);
    if (truncated) return;
    let data = encoder.encode(lines.join(''));
    if (bytes + data.length > limit) {
      data = encoder.encode(new TextDecoder().decode(data.subarray(0, Math.max(0, limit - bytes))).replace(/�$/, '') + TRUNCATION_MARK);
      truncated = true;
    }
    const offset = bytes;
    bytes += data.length;
    void o.writer.write(data);
    o.onSegment(o.stream, offset, data.length);
  };
  return {
    push(chunk) {
      write(o.redactor.push(decoder.decode(chunk, { stream: true })));
    },
    async end() {
      write([...o.redactor.push(decoder.decode()), ...o.redactor.end()]);
      await o.writer.close();
      return { bytes, truncated, counts: o.redactor.counts };
    },
  };
}
