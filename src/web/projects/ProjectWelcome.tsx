import { Button, Space } from 'antd';
import { motion } from 'motion/react';
import { foundations } from '../design-system/tokens.js';

export function ProjectWelcome({
  onSelect,
  onCreate,
}: {
  onSelect: () => void;
  onCreate: () => void;
}) {
  return (
    <motion.section
      className="empty-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: foundations.motion.durationMs.reveal / 1000 }}
    >
      <div className="empty-illustration" aria-hidden="true">
        <svg viewBox="0 0 220 160" fill="none">
          <path
            d="M48 30 168 24 177 131 54 137Z"
            fill="var(--ds-color-surface-paper)"
            stroke="var(--ds-color-border-subtle)"
            strokeWidth="1.5"
          />
          <path
            d="m57 23 120 8-7 108-122-8Z"
            fill="var(--ds-color-surface-paper)"
            stroke="var(--ds-color-border-interactive)"
            strokeWidth="1.5"
          />
          <path
            d="m73 58 67 4M71 73l86 5M70 88l46 3"
            stroke="var(--ds-color-border-subtle)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M147 120c-2-16 3-30 10-41m-8 28c-13 1-20-5-21-15 13-1 21 4 21 15Zm5-15c-1-11 4-19 16-22 2 12-3 20-16 22Z"
            fill="var(--ds-color-accent-soft)"
            stroke="var(--ds-color-accent-solid)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="m39 144 140 2"
            stroke="var(--ds-color-border-subtle)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <h1>先从一个项目开始</h1>
      <p className="empty-description">
        把项目的业务、需求和设计留在一起。
        <br />
        每次继续开发，都能接上之前的理解。
      </p>
      <Space className="project-welcome-actions" wrap>
        <Button type="primary" onClick={onCreate}>
          创建项目
        </Button>
        <Button onClick={onSelect}>选择已有项目</Button>
      </Space>
    </motion.section>
  );
}
