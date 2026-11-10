import { useRef, useState } from 'react';
import { Alert, Form, Input, Modal } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateProjectRequest } from '../../contracts/projects-http.js';
import { createProject } from './queries.js';
import { HttpError } from '../data/http.js';
import { foundations } from '../design-system/tokens.js';
import { keepPendingCreation, readPendingCreation } from './pending-creation.js';

export function CreateProjectDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [form] = Form.useForm<{ name: string }>();
  const [restored] = useState(readPendingCreation);
  const pending = useRef<CreateProjectRequest | null>(restored);
  const [storageWarning, setStorageWarning] = useState(false);
  const keep = (value: CreateProjectRequest | null) => {
    try {
      keepPendingCreation(value);
      setStorageWarning(false);
    } catch (error) {
      console.warn('无法保留项目创建请求', error);
      setStorageWarning(true);
    }
  };
  const queries = useQueryClient();
  const mutation = useMutation({
    mutationFn: createProject,
    onSuccess: (result) => {
      pending.current = null;
      keep(null);
      form.setFieldValue('name', '');
      void queries.invalidateQueries({ queryKey: ['project-list'] });
      onCreated(result.projectId);
    },
    onError: (error) => {
      if (error instanceof HttpError && error.status < 500 && error.status !== 408) {
        pending.current = null;
        keep(null);
      }
    },
  });
  const uncertain =
    Boolean(pending.current) &&
    (Boolean(restored) ||
      (mutation.isError &&
        (!(mutation.error instanceof HttpError) || mutation.error.status >= 500)));
  const close = () => {
    if (!mutation.isPending) {
      if (!uncertain) {
        pending.current = null;
        keep(null);
        mutation.reset();
        form.setFieldValue('name', '');
      }
      onClose();
    }
  };
  return (
    <Modal
      title="创建项目"
      open={open}
      onCancel={close}
      width={foundations.size.modal}
      okText={uncertain || mutation.isError ? '重试创建' : '创建项目'}
      confirmLoading={mutation.isPending}
      cancelButtonProps={{ disabled: mutation.isPending }}
      closable={!mutation.isPending}
      mask={{ closable: !mutation.isPending }}
      onOk={() => form.submit()}
    >
      <p className="project-dialog-description">
        先给项目起个名字，之后由 Agent 补齐综述、需求和设计。
      </p>
      <Form
        form={form}
        layout="vertical"
        initialValues={{ name: restored?.name ?? '' }}
        onFinish={({ name }) => {
          const normalized = name.trim();
          if (!pending.current || pending.current.name !== normalized)
            pending.current = {
              operationId: crypto.randomUUID(),
              name: normalized,
              repositoryLocator: null,
            };
          keep(pending.current);
          mutation.mutate(pending.current);
        }}
      >
        <Form.Item
          name="name"
          label="项目名称"
          rules={[{ required: true, whitespace: true, message: '请填写项目名称' }]}
        >
          <Input
            autoFocus
            disabled={mutation.isPending || uncertain}
            placeholder="例如：订单管理系统"
            autoComplete="off"
          />
        </Form.Item>
      </Form>
      {mutation.isError && (
        <Alert
          type="error"
          showIcon
          title={uncertain ? '创建结果未确认，请保留原名称重试。' : mutation.error.message}
          description={uncertain ? '重试使用同一操作标识，不会重复创建项目。' : undefined}
        />
      )}
      {uncertain && !mutation.isError && (
        <Alert type="info" showIcon title="已恢复上次待确认的创建请求，可重试核对结果。" />
      )}
      {storageWarning && (
        <Alert type="warning" title="浏览器无法保留创建请求，结果未确认时请保持本页打开。" />
      )}
    </Modal>
  );
}
