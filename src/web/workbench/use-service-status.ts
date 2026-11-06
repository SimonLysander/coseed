import { useEffect, useState } from 'react';
import { serviceStatusSchema, type ServiceStatus } from '../../contracts/service-status.js';

export type Connection =
  | { state: 'loading' }
  | { state: 'ready'; data: ServiceStatus }
  | { state: 'error'; message: string };

export function useServiceStatus() {
  const [connection, setConnection] = useState<Connection>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setConnection({ state: 'loading' });
    void (async () => {
      try {
        const response = await fetch('/api/status', { signal: controller.signal });
        if (!response.ok)
          throw new Error(`本地服务返回 ${response.status}，请检查服务是否正常运行。`);
        const parsed = serviceStatusSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error('服务返回的信息不符合预期，请检查前后端版本。');
        if (!controller.signal.aborted) setConnection({ state: 'ready', data: parsed.data });
      } catch (error) {
        if (!controller.signal.aborted)
          setConnection({
            state: 'error',
            message: error instanceof Error ? error.message : '无法连接本地服务。',
          });
      }
    })();
    return () => controller.abort();
  }, [attempt]);

  return { connection, retry: () => setAttempt((value) => value + 1) };
}
