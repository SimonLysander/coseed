import { useState } from 'react';
import { Alert, Button, Empty, Input, List, Modal, Space, Spin } from 'antd';
import { useInfiniteQuery } from '@tanstack/react-query';
import { PlusIcon } from '@animateicons/react/lucide/plus-icon';
import { foundations } from '../design-system/tokens.js';
import { listProjects } from './queries.js';

export function ProjectPicker({
  open,
  selectedId,
  onClose,
  onSelect,
  onCreate,
}: {
  open: boolean;
  selectedId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  const [name, setName] = useState('');
  const query = useInfiniteQuery({
    queryKey: ['project-list', name],
    queryFn: ({ pageParam, signal }) => listProjects(name, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextAfterId ?? undefined,
    enabled: open,
  });
  const projects = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <Modal
      title="选择项目"
      open={open}
      onCancel={onClose}
      footer={null}
      width={foundations.size.modal}
    >
      <div className="project-picker-tools">
        <Input.Search
          aria-label="搜索项目"
          placeholder="搜索项目名称"
          onSearch={(value) => setName(value.trim())}
          allowClear
        />
        <Button
          icon={<PlusIcon className="ds-icon" size={foundations.size.icon} />}
          onClick={onCreate}
        >
          创建项目
        </Button>
      </div>
      {query.isPending ? (
        <div className="project-picker-loading" role="status">
          <Spin />
          正在读取项目…
        </div>
      ) : query.isError ? (
        <Alert
          type="error"
          showIcon
          title="无法读取项目列表"
          description={query.error.message}
          action={
            <Button size="small" onClick={() => void query.refetch()}>
              重新读取
            </Button>
          }
        />
      ) : (
        <List
          rowKey="id"
          className="project-list"
          dataSource={projects}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={name ? '没有找到匹配的项目' : '还没有项目'}
              />
            ),
          }}
          renderItem={(project) => (
            <List.Item>
              <Button
                type="text"
                className={`project-list-item${project.id === selectedId ? ' project-list-current' : ''}`}
                onClick={() => onSelect(project.id)}
              >
                <span className="project-list-name">{project.name}</span>
                <span className="project-list-date">
                  {project.id === selectedId
                    ? '当前项目'
                    : `创建于 ${new Intl.DateTimeFormat('zh-CN').format(project.createdAt)}`}
                </span>
              </Button>
            </List.Item>
          )}
        />
      )}
      {query.hasNextPage && (
        <Space className="project-picker-more">
          <Button loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
            加载更多
          </Button>
        </Space>
      )}
    </Modal>
  );
}
