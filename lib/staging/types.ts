export interface BatchStorage<T> {
  writeBatch(runId: string, index: number, items: T[]): Promise<void>;
  readBatch(runId: string, index: number): Promise<T[]>;
  cleanup(runId: string, totalBatches: number): Promise<void>;
}
