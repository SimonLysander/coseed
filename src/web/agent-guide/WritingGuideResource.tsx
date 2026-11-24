import { ArrowUpRightIcon } from '@animateicons/react/lucide/arrow-up-right-icon';
import { CopyIcon } from '@animateicons/react/lucide/copy-icon';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'antd';
import { foundations } from '../design-system/tokens.js';
import { writingGuidePath } from './guide-content.js';
import { useClipboardCopy } from './use-clipboard-copy.js';

export function WritingGuideResource() {
  const resource = useQuery({
    queryKey: ['agent-writing-guide'],
    queryFn: async ({ signal }) => {
      const response = await fetch(writingGuidePath, { signal });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('text/plain')) {
        throw new Error('暂时无法读取规范原文。');
      }
      return response.text();
    },
  });
  const { state, copy } = useClipboardCopy(resource.data ?? '');

  return (
    <div className="guide-resource" role="group" aria-label="Agent 写作规范">
      <div className="guide-resource-actions">
        <a
          className="guide-resource-link"
          href={writingGuidePath}
          target="_blank"
          rel="noopener"
          aria-describedby="guide-resource-description"
        >
          阅读 Agent 写作规范
          <ArrowUpRightIcon
            className="ds-icon"
            size={foundations.size.icon}
            isAnimated={false}
            aria-hidden="true"
          />
        </a>
        <Button
          type="text"
          size="small"
          disabled={!resource.data}
          icon={
            <CopyIcon
              className="ds-icon"
              size={foundations.size.icon}
              isAnimated={false}
              aria-hidden="true"
            />
          }
          onClick={() => void copy()}
        >
          <span aria-live="polite">{state === 'copied' ? '已复制' : '复制全文'}</span>
        </Button>
      </div>
      <p id="guide-resource-description">
        编写或更新项目资料前，请 Agent
        仔细阅读完整规范。文中说明何时修订已有内容、何时新增进展记录，以及如何注明结论的来源，便于后续核对。
      </p>
      {resource.isError && (
        <div className="guide-copy-error" role="alert">
          暂时无法读取规范原文。
          <Button type="link" size="small" onClick={() => void resource.refetch()}>
            重试
          </Button>
        </div>
      )}
      {state === 'failed' && (
        <span className="guide-copy-error" role="alert">
          复制失败。请打开原文后手动复制。
        </span>
      )}
    </div>
  );
}
