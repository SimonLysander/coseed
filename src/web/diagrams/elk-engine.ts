import ELK, { type ELK as ElkEngine } from 'elkjs/lib/elk-api.js';
import ElkWorker from 'elkjs/lib/elk-worker.min.js?worker';

let engine: ElkEngine | null = null;
let consumers = 0;
export function acquireLayout() {
  engine ??= new ELK({ workerFactory: () => new ElkWorker() });
  const current = engine;
  consumers++;
  return {
    engine: current,
    release: () => {
      consumers--;
      if (consumers === 0) {
        current.terminateWorker();
        engine = null;
      }
    },
  };
}
