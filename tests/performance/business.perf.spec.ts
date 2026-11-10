import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createFixture } from '../helpers/project-fixture.js';
import { seedBusinessFixture } from '../helpers/business-fixture.js';
import { seedBusinessLoadFixture } from '../helpers/business-load-fixture.js';

interface Probe {
  tasks: { start: number; duration: number }[];
  frames: number[];
  last: number | null;
  recording: boolean;
}
declare global {
  interface Window {
    businessProbe: Probe;
  }
}
const samples = Number(process.env.COSEED_PERF_SAMPLES ?? 5);
if (!Number.isInteger(samples) || samples < 1 || samples > 20)
  throw new Error('COSEED_PERF_SAMPLES must be 1..20');
const summary = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.ceil(p * sorted.length) - 1]!;
  return {
    samples: values.length,
    p50: Math.round(percentile(0.5) * 10) / 10,
    p95: Math.round(percentile(0.95) * 10) / 10,
    max: Math.round(sorted.at(-1)! * 10) / 10,
  };
};
async function completeFrame(page: Page, nodes: number, edges: number) {
  const canvas = page.getByRole('region', { name: '业务设计画布', exact: true });
  await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 90_000 });
  await expect(canvas.locator('.business-card')).toHaveCount(nodes);
  await expect(canvas.locator('.business-edge-label')).toHaveCount(edges);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  return canvas;
}
async function timing(page: Page, start: number) {
  return page.evaluate(
    (start) => ({
      completeMs: performance.now() - start,
      phases: Object.fromEntries(
        performance
          .getEntriesByType('measure')
          .filter((entry) => entry.name.startsWith('coseed.business.'))
          .map((entry) => [entry.name.replace('coseed.business.', ''), entry.duration]),
      ),
      longTasks: window.businessProbe.tasks
        .filter((task) => task.start >= start)
        .map((task) => task.duration),
      http: performance
        .getEntriesByType('resource')
        .filter((entry) => entry.startTime >= start && entry.name.includes('/business/diagrams/'))
        .map((entry) => entry.duration),
      resources: performance
        .getEntriesByType('resource')
        .filter((entry) => entry.startTime >= start)
        .map((entry) => ({
          name: new URL(entry.name).pathname,
          bytes: (entry as PerformanceResourceTiming).transferSize,
          duration: entry.duration,
        })),
    }),
    start,
  );
}

for (const count of [13, 100, 300])
  test(`business graph performance ${count} nodes`, async ({
    browser,
    request,
    baseURL,
  }, testInfo) => {
    const project = await createFixture(request, `合成性能 ${count} ${randomUUID().slice(0, 6)}`);
    const fixture =
      count === 13
        ? await seedBusinessFixture(baseURL!, project.projectId).then((value) => ({
            diagramId: value.ids.$internal!,
            nodes: 13,
            edges: 13,
          }))
        : await seedBusinessLoadFixture(baseURL!, project.projectId, count);
    const url = `/#/projects/${project.projectId}/business/diagrams/${fixture.diagramId}?version=1`;
    const cold: Awaited<ReturnType<typeof timing>>[] = [],
      warm: typeof cold = [],
      interactions: { frames: number[]; longTasks: number[] }[] = [],
      memory: unknown[] = [];
    for (let sample = 0; sample < samples; sample++) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.addInitScript(() => {
        window.businessProbe = { tasks: [], frames: [], last: null, recording: false };
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            window.businessProbe.tasks.push({ start: entry.startTime, duration: entry.duration });
        });
        observer.observe({ type: 'longtask', buffered: true });
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        await page.goto(baseURL + url);
        await completeFrame(page, fixture.nodes, fixture.edges);
        cold.push(await timing(page, 0));
        await page.goto(`${baseURL}/#/projects/${project.projectId}/overview`);
        await expect(page.getByText('还没有项目综述', { exact: true })).toBeVisible();
        await expect.poll(() => page.workers().length).toBe(0);
        const start = await page.evaluate(() => performance.now());
        await page.goto(baseURL + url);
        const canvas = await completeFrame(page, fixture.nodes, fixture.edges);
        warm.push(await timing(page, start));
        const interactionStart = await page.evaluate(() => {
          const probe = window.businessProbe;
          probe.frames = [];
          probe.last = null;
          probe.recording = true;
          const frame = (now: number) => {
            if (!probe.recording) return;
            if (probe.last !== null) probe.frames.push(now - probe.last);
            probe.last = now;
            requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
          return performance.now();
        });
        const box = (await canvas.boundingBox())!;
        await page.mouse.move(box.x + 45, box.y + 25);
        await page.mouse.down();
        await page.mouse.move(box.x + 400, box.y + 180, { steps: 24 });
        await page.mouse.up();
        for (let i = 0; i < 6; i++) {
          await page
            .getByRole('button', { name: i % 2 ? '缩小业务图' : '放大业务图', exact: true })
            .click();
        }
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        );
        interactions.push(
          await page.evaluate((start) => {
            window.businessProbe.recording = false;
            return {
              frames: window.businessProbe.frames,
              longTasks: window.businessProbe.tasks
                .filter((t) => t.start >= start)
                .map((t) => t.duration),
            };
          }, interactionStart),
        );
        // Native CDP heap/DOM counters after explicit GC; this is a trend sample, not a proof of no leak.
        if (sample === samples - 1) {
          const session = await context.newCDPSession(page);
          await session.send('HeapProfiler.collectGarbage');
          memory.push({
            state: 'mounted',
            heap: await session.send('Runtime.getHeapUsage'),
            dom: await session.send('Memory.getDOMCounters'),
            workers: page.workers().length,
          });
          for (let cycle = 0; cycle < 5; cycle++) {
            await page.goto(`${baseURL}/#/projects/${project.projectId}/overview`);
            await expect(page.getByText('还没有项目综述', { exact: true })).toBeVisible();
            await expect.poll(() => page.workers().length).toBe(0);
            await session.send('HeapProfiler.collectGarbage');
            memory.push({
              cycle,
              heap: await session.send('Runtime.getHeapUsage'),
              dom: await session.send('Memory.getDOMCounters'),
              workers: page.workers().length,
            });
            await page.goto(baseURL + url);
            await completeFrame(page, fixture.nodes, fixture.edges);
          }
          await session.detach();
        }
        expect(errors).toEqual([]);
      } finally {
        await context.close();
      }
    }
    const report = {
      date: new Date().toISOString(),
      browser: browser.version(),
      viewport: { width: 1440, height: 1000 },
      nodes: fixture.nodes,
      edges: fixture.edges,
      summary: {
        cold: summary(cold.map((sample) => sample.completeMs)),
        warm: summary(warm.map((sample) => sample.completeMs)),
        measurement: summary([...cold, ...warm].map((sample) => sample.phases.measurement!)),
        layout: summary([...cold, ...warm].map((sample) => sample.phases.layout!)),
        assembly: summary([...cold, ...warm].map((sample) => sample.phases.assembly!)),
        interactionFrame: summary(interactions.flatMap((sample) => sample.frames)),
      },
      cold,
      warm,
      interactions,
      memory,
    };
    const reportPath = testInfo.outputPath('metrics.json');
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    await testInfo.attach(`business-${count}.json`, {
      path: reportPath,
      contentType: 'application/json',
    });
    console.log(JSON.stringify({ nodes: count, ...report.summary }));
  });
