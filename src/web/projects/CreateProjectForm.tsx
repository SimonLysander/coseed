import { Alert, Button, Form, Input } from 'antd';
import { CheckIcon } from '@animateicons/react/lucide/check-icon';
import { XIcon } from '@animateicons/react/lucide/x-icon';
import { foundations } from '../design-system/tokens.js';
import type { ProjectCreation } from './use-project-creation.js';

export function CreateProjectForm({
  creation,
  onCancel,
}: {
  creation: ProjectCreation;
  onCancel: () => void;
}) {
  const { form, mutation, uncertain, storageWarning, submit } = creation;
  return (
    <section
      className="project-create-form"
      aria-label="创建项目"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') onCancel();
      }}
    >
      <Form form={form} layout="vertical" onFinish={submit}>
        <div className="project-create-row">
          <Form.Item
            name="name"
            rules={[{ required: true, whitespace: true, message: '请填写项目名称' }]}
          >
            <Input
              aria-label="项目名称"
              autoFocus
              disabled={mutation.isPending || uncertain}
              placeholder="项目名称"
              autoComplete="off"
            />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            aria-label={uncertain || mutation.isError ? '重试创建' : '创建项目'}
            loading={mutation.isPending}
            icon={<CheckIcon className="ds-icon" size={foundations.size.icon} />}
          />
          <Button
            type="text"
            aria-label="取消"
            disabled={mutation.isPending}
            onClick={onCancel}
            icon={<XIcon className="ds-icon" size={foundations.size.icon} />}
          />
        </div>
      </Form>
      {mutation.isError && (
        <Alert
          type="error"
          showIcon
          title={uncertain ? '创建结果未确认，请保留原名称重试。' : mutation.error.message}
          description={uncertain ? '重试不会重复创建项目。' : undefined}
        />
      )}
      {uncertain && !mutation.isError && (
        <Alert type="info" showIcon title="已恢复待确认的创建请求，可重试核对结果。" />
      )}
      {storageWarning && <Alert type="warning" title="浏览器无法保留创建请求，请保持本页打开。" />}
    </section>
  );
}
