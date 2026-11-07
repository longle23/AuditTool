import { blobSource } from '../xlsx/byte-source';
import { inspectWorkbook, mergeMonthlyFiles } from './merge';
import type { WorkerRequest, WorkerResponse } from './worker-protocol';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const ctx = self as unknown as {
  postMessage(message: WorkerResponse): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

ctx.onmessage = async (event) => {
  const request = event.data;

  if (request.type === 'inspect') {
    try {
      const inspection = await inspectWorkbook(blobSource(request.file));
      ctx.postMessage({ type: 'inspected', id: request.id, inspection });
    } catch (error) {
      ctx.postMessage({ type: 'inspect-error', id: request.id, message: errorMessage(error) });
    }
    return;
  }

  try {
    const chunks: BlobPart[] = [];
    const result = await mergeMonthlyFiles(
      request.files.map((f) => ({ name: f.name, source: blobSource(f.file) })),
      {
        sheetName: request.sheetName,
        onData: (chunk) => chunks.push(chunk as BlobPart),
        onProgress: (progress) => ctx.postMessage({ type: 'progress', progress }),
      },
    );
    ctx.postMessage({ type: 'merged', blob: new Blob(chunks, { type: XLSX_MIME }), result });
  } catch (error) {
    ctx.postMessage({ type: 'merge-error', message: errorMessage(error) });
  }
};
