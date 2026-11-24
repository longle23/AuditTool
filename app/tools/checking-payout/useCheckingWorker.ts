'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { WorkerRequest, WorkerResponse } from '@/lib/checking-payout/worker-protocol';

export function useCheckingWorker(onMessage: (message: WorkerResponse) => void) {
  const workerRef = useRef<Worker | null>(null);
  const handlerRef = useRef(onMessage);

  useEffect(() => {
    handlerRef.current = onMessage;
  }, [onMessage]);

  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      const worker = new Worker(new URL('../../../lib/checking-payout/checking.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => handlerRef.current(event.data);
      worker.onerror = (event) => {
        event.preventDefault();
        handlerRef.current({ type: 'error', message: event.message || 'Tiến trình xử lý gặp lỗi không xác định.' });
      };
      workerRef.current = worker;
    }
    return workerRef.current;
  }, []);

  const post = useCallback((request: WorkerRequest) => getWorker().postMessage(request), [getWorker]);

  const reset = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  useEffect(() => () => workerRef.current?.terminate(), []);

  return { post, reset };
}
