import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Empty, Select, Spin, type RefSelectProps } from 'antd';
import { useInfiniteQuery } from '@tanstack/react-query';
import { PlusIcon } from '@animateicons/react/lucide/plus-icon';
import { CheckIcon } from '@animateicons/react/lucide/check-icon';
import { foundations } from '../design-system/tokens.js';
import { listProjects } from './queries.js';

export function ProjectPicker({
  open,
  selectedId,
  selectedName,
  onOpenChange,
  onSelect,
  onCreate,
}: {
  open: boolean;
  selectedId: string | null;
  selectedName: string | null;
  onOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  const [name, setName] = useState('');
  const select = useRef<RefSelectProps>(null);
  useEffect(() => {
    if (open) select.current?.focus();
    else setName('');
  }, [open]);
  const query = useInfiniteQuery({
    queryKey: ['project-list', name.trim()],
    queryFn: ({ pageParam, signal }) => listProjects(name.trim(), pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextAfterId ?? undefined,
    enabled: open,
  });
  const projects = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <Select<string>
      ref={select}
      className="project-slot"
      aria-label={selectedName ? `切换项目，当前：${selectedName}` : '选择项目'}
      placeholder="选择项目"
      value={selectedId}
      labelRender={() => selectedName ?? '当前项目'}
      open={open}
      onOpenChange={onOpenChange}
      showSearch={{ searchValue: name, onSearch: setName, filterOption: false }}
      loading={query.isFetching && open}
      defaultActiveFirstOption={false}
      placement="bottomLeft"
      getPopupContainer={(trigger: HTMLElement) =>
        trigger.closest<HTMLElement>('.ant-drawer-body') ?? document.body
      }
      popupMatchSelectWidth={foundations.size.projectPicker}
      classNames={{ popup: { root: 'project-picker-popup' } }}
      virtual={false}
      options={projects.map((project) => ({ value: project.id, label: project.name, title: '' }))}
      onSelect={onSelect}
      optionRender={({ data }) => (
        <div className="project-option">
          <span className="project-option-name">{data.label}</span>
          {data.value === selectedId && (
            <CheckIcon className="ds-icon" size={foundations.size.icon} aria-label="当前项目" />
          )}
        </div>
      )}
      notFoundContent={
        query.isPending ? (
          <div className="project-picker-loading" role="status">
            <Spin />
            正在读取项目…
          </div>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={name ? '没有找到匹配的项目' : '还没有项目'}
          />
        )
      }
      popupRender={(menu) => (
        <section
          role="region"
          aria-label="选择项目"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onOpenChange(false);
              select.current?.focus();
            }
          }}
        >
          {query.isError ? (
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
            menu
          )}
          {query.hasNextPage && (
            <div className="project-picker-more" onMouseDown={(event) => event.preventDefault()}>
              <Button
                type="text"
                loading={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                加载更多
              </Button>
            </div>
          )}
          <div className="project-picker-create" onMouseDown={(event) => event.preventDefault()}>
            <Button
              type="text"
              icon={<PlusIcon className="ds-icon" size={foundations.size.icon} />}
              onClick={onCreate}
            >
              创建项目
            </Button>
          </div>
        </section>
      )}
    />
  );
}
