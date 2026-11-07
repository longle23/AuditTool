import type { MergeProgress, MergeResult, WorkbookInspection } from './merge';

export type WorkerRequest =
  | { type: 'inspect'; id: string; file: File }
  | { type: 'merge'; files: { name: string; file: File }[]; sheetName: string };

export type WorkerResponse =
  | { type: 'inspected'; id: string; inspection: WorkbookInspection }
  | { type: 'inspect-error'; id: string; message: string }
  | { type: 'progress'; progress: MergeProgress }
  | { type: 'merged'; blob: Blob; result: MergeResult }
  | { type: 'merge-error'; message: string };
