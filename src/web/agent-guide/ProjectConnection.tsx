import { useState } from 'react';
import { Alert, Button, Input, Popconfirm, Typography } from 'antd';
import { CopyIcon } from '@animateicons/react/lucide/copy-icon';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  issuedProjectKeySchema,
  projectKeyListSchema,
  revokedProjectKeySchema,
} from '../../contracts/projects-http.js';
import { request } from '../data/http.js';
import { foundations } from '../design-system/tokens.js';
import { mcpAddress } from './guide-content.js';
import { useClipboardCopy } from './use-clipboard-copy.js';

function IssuedProjectKey({ value }: { value: string }) {
  const { state, copy } = useClipboardCopy(value);
  return (
    <div className="guide-issued-key">
      <label htmlFor="issued-project-key">完整密钥仅在生成时显示。请在离开本页前复制并保存。</label>
      <div className="guide-key-actions">
        <Input.Password id="issued-project-key" value={value} readOnly autoComplete="off" />
        <Button
          size="small"
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
          复制密钥
        </Button>
      </div>
      {state === 'copied' && (
        <span className="guide-copy-result" role="status">
          已复制项目密钥
        </span>
      )}
      {state === 'failed' && (
        <span className="guide-copy-error" role="alert">
          复制失败。请选中密钥后手动复制。
        </span>
      )}
    </div>
  );
}

export function ProjectConnection({
  projectId,
  name,
  onSelect,
}: {
  projectId: string | null;
  name: string | undefined;
  onSelect: () => void;
}) {
  const client = useQueryClient();
  const path = `/api/projects/${encodeURIComponent(projectId ?? '')}/mcp-keys`;
  const queryKey = ['projects', projectId, 'mcp-keys'];
  const keys = useQuery({
    queryKey,
    enabled: !!projectId,
    queryFn: ({ signal }) => request(path, projectKeyListSchema, { signal }),
  });
  const [issued, setIssued] = useState<{ id: string; key: string } | null>(null);
  const issue = useMutation({
    mutationFn: async () => {
      const { id, key } = await request(path, issuedProjectKeySchema, { method: 'POST' });
      setIssued({ id, key });
    },
    onSuccess: () => client.invalidateQueries({ queryKey }),
    gcTime: 0,
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      request(path + '/' + encodeURIComponent(id), revokedProjectKeySchema, { method: 'DELETE' }),
    onSuccess: ({ id }) => {
      setIssued((current) => (current?.id === id ? null : current));
      void client.invalidateQueries({ queryKey });
    },
  });
  return (
    <div className="guide-connection">
      <div className="guide-connection-row">
        <span>MCP 地址</span>
        <Typography.Text code copyable={{ text: mcpAddress, tooltips: false }}>
          {mcpAddress}
        </Typography.Text>
      </div>
      {projectId ? (
        <>
          <div className="guide-connection-row">
            <span>项目密钥</span>
            <div className="guide-key-actions">
              <span>{name}</span>
              <Button size="small" loading={issue.isPending} onClick={() => issue.mutate()}>
                生成密钥
              </Button>
            </div>
          </div>
          {issued && <IssuedProjectKey key={issued.id} value={issued.key} />}
          {keys.data?.items.map((k) => (
            <div className="guide-key-item" key={k.id}>
              <code>•••• {k.hint}</code>
              <span>{new Date(k.createdAt).toLocaleDateString()}</span>
              <Popconfirm
                title="撤销此项目密钥？"
                description="撤销后，使用此密钥的编程助手需要改用该项目的其他有效密钥。"
                okText="撤销"
                cancelText="取消"
                okButtonProps={{ 'aria-label': '确认撤销' }}
                onConfirm={() => revoke.mutate(k.id)}
              >
                <Button type="text" size="small">
                  撤销
                </Button>
              </Popconfirm>
            </div>
          ))}
          {(keys.error || issue.error || revoke.error) && (
            <Alert type="error" title={(keys.error || issue.error || revoke.error)?.message} />
          )}
        </>
      ) : (
        <div className="guide-key-actions">
          <span>选择项目后可生成该项目的密钥。</span>
          <Button size="small" onClick={onSelect}>
            选择项目
          </Button>
        </div>
      )}
    </div>
  );
}
