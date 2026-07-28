import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  IconAlertTriangle,
  IconCircle,
  IconCircleCheck,
  IconCircleX,
  IconGitBranch,
  IconLoader2,
  IconRefresh,
  IconSettings,
} from "@tabler/icons-react";
import type {
  StartupLoadingStep,
  StartupProgress,
  StartupStepStatus,
} from "./App.types";

type DisplayStatus = "pending" | StartupStepStatus;

type StartupLoadingProps = {
  backendProgress: StartupProgress | null;
  frontendSteps: StartupLoadingStep[];
  status: "loading" | "error";
  error?: string;
  canContinue?: boolean;
  onRetry: () => void;
  onContinue: () => void;
};

const STATUS_LABELS: Record<DisplayStatus, string> = {
  pending: "等待中",
  running: "进行中",
  success: "已完成",
  warning: "有警告",
  error: "失败",
};

function formatDuration(durationMs: number) {
  if (durationMs < 1_000) return `${Math.max(0, Math.round(durationMs))} ms`;
  if (durationMs < 60_000) return `${(durationMs / 1_000).toFixed(1)} s`;
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.floor((durationMs % 60_000) / 1_000);
  return `${minutes}m ${seconds}s`;
}

function StatusIcon({ status }: { status: DisplayStatus }) {
  const props = {
    size: 18,
    stroke: 1.8,
    "aria-hidden": true,
  } as const;

  if (status === "running") {
    return <IconLoader2 {...props} className="spinner" />;
  }
  if (status === "success") return <IconCircleCheck {...props} />;
  if (status === "warning") return <IconAlertTriangle {...props} />;
  if (status === "error") return <IconCircleX {...props} />;
  return <IconCircle {...props} />;
}

function StepRow({
  step,
  now,
}: {
  step: StartupLoadingStep;
  now: number;
}) {
  const durationMs =
    step.status === "running" && step.startedAtMs
      ? now - step.startedAtMs
      : step.durationMs;

  return (
    <li className={`startup-step-row ${step.status}`}>
      <span
        className="startup-step-status"
        title={STATUS_LABELS[step.status]}
        aria-label={STATUS_LABELS[step.status]}
      >
        <StatusIcon status={step.status} />
      </span>
      <span className="startup-step-copy">
        <strong>{step.label}</strong>
        {step.detail && <span>{step.detail}</span>}
      </span>
      <time className="startup-step-duration">
        {durationMs === undefined ? "—" : formatDuration(durationMs)}
      </time>
    </li>
  );
}

function StepGroup({
  title,
  icon,
  steps,
  now,
}: {
  title: string;
  icon: ReactNode;
  steps: StartupLoadingStep[];
  now: number;
}) {
  return (
    <section className="startup-log-group" aria-label={title}>
      <h2>
        {icon}
        {title}
      </h2>
      <ol className="startup-step-list">
        {steps.map((step) => (
          <StepRow key={step.id} step={step} now={now} />
        ))}
      </ol>
    </section>
  );
}

export function StartupLoading({
  backendProgress,
  frontendSteps,
  status,
  error,
  canContinue = false,
  onRetry,
  onContinue,
}: StartupLoadingProps) {
  const hasRunningStep =
    backendProgress?.steps.some((step) => step.status === "running") ||
    frontendSteps.some((step) => step.status === "running");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!hasRunningStep) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [hasRunningStep]);

  const backendSteps = useMemo<StartupLoadingStep[]>(
    () => {
      if (backendProgress?.steps.length) return backendProgress.steps;
      const progressStep = frontendSteps.find(
        (step) => step.id === "read_startup_trace",
      );
      return [
        {
          id: "backend-progress-pending",
          label: "等待后端启动记录",
          status: status === "error" ? "warning" : "running",
          detail:
            status === "error"
              ? "未能读取后端记录，可查看 codey.log"
              : "正在连接 Codey bridge",
          startedAtMs: progressStep?.startedAtMs,
        },
      ];
    },
    [backendProgress, frontendSteps, status],
  );
  const elapsedMs = backendProgress
    ? backendProgress.status === "running" && backendProgress.startedAtMs
      ? now - backendProgress.startedAtMs
      : backendProgress.elapsedMs
    : undefined;

  return (
    <main
      className={`app-shell startup-loading-shell ${status}`}
      aria-busy={status === "loading"}
    >
      <div className="startup-loading-content">
        <header className="startup-loading-header">
          <div className="startup-loading-mark" aria-hidden="true">
            <IconGitBranch size={21} stroke={1.8} />
          </div>
          <div className="startup-loading-heading">
            <span className="startup-loading-kicker">Codey</span>
            <h1>{status === "error" ? "启动未完成" : "正在启动"}</h1>
            <p aria-live="polite">
              {error ||
                (elapsedMs === undefined
                  ? "正在读取启动进度"
                  : `已用时 ${formatDuration(elapsedMs)}`)}
            </p>
          </div>
          {status === "loading" && (
            <IconLoader2
              className="spinner startup-loading-spinner"
              size={20}
              aria-hidden="true"
            />
          )}
        </header>

        <div className="startup-log-groups">
          <StepGroup
            title="Codex 启动"
            icon={<IconGitBranch size={16} aria-hidden="true" />}
            steps={backendSteps}
            now={now}
          />
          <StepGroup
            title="设置面板"
            icon={<IconSettings size={16} aria-hidden="true" />}
            steps={frontendSteps}
            now={now}
          />
        </div>

        {status === "error" && (
          <div className="startup-loading-actions">
            <button
              className="startup-action-button primary"
              type="button"
              onClick={onRetry}
            >
              <IconRefresh size={16} aria-hidden="true" />
              重新检测
            </button>
            {canContinue && (
              <button
                className="startup-action-button secondary"
                type="button"
                onClick={onContinue}
              >
                进入设置
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
