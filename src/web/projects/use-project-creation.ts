import { useRef, useState } from 'react';
import { Form } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateProjectRequest } from '../../contracts/projects-http.js';
import { createProject } from './queries.js';
import { HttpError } from '../data/http.js';
import { keepPendingCreation, readPendingCreation } from './pending-creation.js';

export function useProjectCreation(onCreated: (id: string) => void) {
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
        (!(mutation.error instanceof HttpError) ||
          mutation.error.status >= 500 ||
          mutation.error.status === 408)));
  const cancel = () => {
    if (!mutation.isPending) {
      if (!uncertain) {
        pending.current = null;
        keep(null);
        mutation.reset();
        form.setFieldValue('name', '');
      }
      return true;
    }
    return false;
  };
  const begin = (name = '') => {
    if (!pending.current) mutation.reset();
    form.setFieldValue('name', pending.current?.name ?? name);
  };
  const submit = ({ name }: { name: string }) => {
    const normalized = name.trim();
    if (!pending.current || pending.current.name !== normalized)
      pending.current = {
        operationId: crypto.randomUUID(),
        name: normalized,
        repositoryLocator: null,
      };
    keep(pending.current);
    mutation.mutate(pending.current);
  };
  return { form, mutation, uncertain, storageWarning, begin, submit, cancel };
}

export type ProjectCreation = ReturnType<typeof useProjectCreation>;
