import { Button, Modal } from 'antd';
import type { Connection } from './use-service-status.js';

export default function ServiceConnectionDialog({
  connection,
  onClose,
}: {
  connection: Connection;
  onClose: () => void;
}) {
  return (
    <Modal
      title="本地服务"
      open
      onCancel={onClose}
      footer={<Button onClick={onClose}>关闭</Button>}
    >
      {connection.state === 'ready' ? (
        <dl className="service-details">
          <dt>版本</dt>
          <dd>{connection.data.version}</dd>
          <dt>数据库</dt>
          <dd>已就绪</dd>
          <dt>接入状态</dt>
          <dd>已提供项目读取、快照导出、保存和修订查询工具。</dd>
        </dl>
      ) : (
        <p>{connection.state === 'loading' ? '正在检查服务连接…' : connection.message}</p>
      )}
    </Modal>
  );
}
