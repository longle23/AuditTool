import type { CheckingProgress, CheckingResult } from './types';

export type WorkerRequest =
  | { type: 'inspect'; file: File }
  | { type: 'run'; file: File };

export type WorkerResponse =
  | { type: 'inspected'; sheets: { role: string; name: string }[] }
  | { type: 'inspect-error'; message: string }
  | { type: 'progress'; progress: CheckingProgress }
  | { type: 'done'; blob: Blob; result: CheckingResult }
  | { type: 'error'; message: string };
