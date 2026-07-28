use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
#[cfg(not(test))]
use serde_json::json;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StartupProgressStatus {
    Idle,
    Running,
    Success,
    Error,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StartupStepStatus {
    Running,
    Success,
    Warning,
    Error,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupStep {
    pub id: String,
    pub label: String,
    pub status: StartupStepStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    pub started_at_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finished_at_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupProgressSnapshot {
    pub status: StartupProgressStatus,
    pub started_at_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finished_at_ms: Option<u64>,
    pub captured_at_ms: u64,
    pub elapsed_ms: u64,
    pub steps: Vec<StartupStep>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug)]
struct StartupProgressState {
    status: StartupProgressStatus,
    started_at_ms: u64,
    finished_at_ms: Option<u64>,
    steps: Vec<StartupStep>,
    error: Option<String>,
}

impl Default for StartupProgressState {
    fn default() -> Self {
        Self {
            status: StartupProgressStatus::Idle,
            started_at_ms: 0,
            finished_at_ms: None,
            steps: Vec::new(),
            error: None,
        }
    }
}

#[derive(Clone, Default)]
pub struct StartupProgress {
    inner: Arc<Mutex<StartupProgressState>>,
}

#[cfg_attr(test, allow(dead_code))]
#[derive(Debug)]
struct StartupTransition {
    event: &'static str,
    step_id: Option<String>,
    label: String,
    status: StartupStepStatus,
    detail: Option<String>,
    elapsed_ms: u64,
    duration_ms: Option<u64>,
}

impl StartupProgress {
    pub fn begin_session(&self) {
        let now = unix_timestamp_millis();
        *self.state() = StartupProgressState {
            status: StartupProgressStatus::Running,
            started_at_ms: now,
            finished_at_ms: None,
            steps: Vec::new(),
            error: None,
        };
        emit_transition(StartupTransition {
            event: "session_started",
            step_id: None,
            label: "开始启动 Codey".to_string(),
            status: StartupStepStatus::Running,
            detail: None,
            elapsed_ms: 0,
            duration_ms: None,
        });
    }

    pub fn ensure_session(&self) {
        if self.state().status != StartupProgressStatus::Running {
            self.begin_session();
        }
    }

    pub fn start_step(
        &self,
        id: impl Into<String>,
        label: impl Into<String>,
        detail: impl Into<String>,
    ) {
        let now = unix_timestamp_millis();
        let id = id.into();
        let label = label.into();
        let detail = optional_detail(detail.into());
        let mut state = self.state();
        let elapsed_ms = now.saturating_sub(state.started_at_ms);
        state.steps.retain(|step| step.id != id);
        state.steps.push(StartupStep {
            id: id.clone(),
            label: label.clone(),
            status: StartupStepStatus::Running,
            detail: detail.clone(),
            started_at_ms: now,
            finished_at_ms: None,
            duration_ms: None,
        });
        drop(state);
        emit_transition(StartupTransition {
            event: "step_started",
            step_id: Some(id),
            label,
            status: StartupStepStatus::Running,
            detail,
            elapsed_ms,
            duration_ms: None,
        });
    }

    pub fn finish_step(&self, id: &str, detail: impl Into<String>) {
        self.finish_step_with_status(id, StartupStepStatus::Success, detail.into());
    }

    pub fn warn_step(&self, id: &str, detail: impl Into<String>) {
        self.finish_step_with_status(id, StartupStepStatus::Warning, detail.into());
    }

    pub fn fail_step(&self, id: &str, detail: impl Into<String>) {
        self.finish_step_with_status(id, StartupStepStatus::Error, detail.into());
    }

    pub fn complete(&self) {
        let now = unix_timestamp_millis();
        let mut state = self.state();
        state.status = StartupProgressStatus::Success;
        state.finished_at_ms = Some(now);
        state.error = None;
        let elapsed_ms = now.saturating_sub(state.started_at_ms);
        drop(state);
        emit_transition(StartupTransition {
            event: "session_finished",
            step_id: None,
            label: "Codey 启动完成".to_string(),
            status: StartupStepStatus::Success,
            detail: Some(format!("总耗时 {}", format_duration(elapsed_ms))),
            elapsed_ms,
            duration_ms: Some(elapsed_ms),
        });
    }

    pub fn fail(&self, error: impl Into<String>) {
        let error = error.into();
        let now = unix_timestamp_millis();
        let mut state = self.state();
        let elapsed_ms = now.saturating_sub(state.started_at_ms);
        if let Some(step) = state
            .steps
            .iter_mut()
            .rev()
            .find(|step| step.status == StartupStepStatus::Running)
        {
            step.status = StartupStepStatus::Error;
            step.detail = Some(error.clone());
            step.finished_at_ms = Some(now);
            step.duration_ms = Some(now.saturating_sub(step.started_at_ms));
        }
        for step in state
            .steps
            .iter_mut()
            .filter(|step| step.status == StartupStepStatus::Running)
        {
            step.status = StartupStepStatus::Warning;
            step.detail = Some("启动已中止".to_string());
            step.finished_at_ms = Some(now);
            step.duration_ms = Some(now.saturating_sub(step.started_at_ms));
        }
        state.status = StartupProgressStatus::Error;
        state.finished_at_ms = Some(now);
        state.error = Some(error.clone());
        drop(state);
        emit_transition(StartupTransition {
            event: "session_failed",
            step_id: None,
            label: "Codey 启动失败".to_string(),
            status: StartupStepStatus::Error,
            detail: Some(error),
            elapsed_ms,
            duration_ms: Some(elapsed_ms),
        });
    }

    pub fn snapshot(&self) -> StartupProgressSnapshot {
        let captured_at_ms = unix_timestamp_millis();
        let state = self.state();
        let finished_at_ms = state.finished_at_ms;
        StartupProgressSnapshot {
            status: state.status,
            started_at_ms: state.started_at_ms,
            finished_at_ms,
            captured_at_ms,
            elapsed_ms: if state.started_at_ms == 0 {
                0
            } else {
                finished_at_ms
                    .unwrap_or(captured_at_ms)
                    .saturating_sub(state.started_at_ms)
            },
            steps: state.steps.clone(),
            error: state.error.clone(),
        }
    }

    fn finish_step_with_status(&self, id: &str, status: StartupStepStatus, detail: String) {
        let now = unix_timestamp_millis();
        let mut state = self.state();
        let elapsed_ms = now.saturating_sub(state.started_at_ms);
        let Some(step) = state.steps.iter_mut().rev().find(|step| step.id == id) else {
            return;
        };
        let duration_ms = now.saturating_sub(step.started_at_ms);
        step.status = status;
        step.detail = optional_detail(detail);
        step.finished_at_ms = Some(now);
        step.duration_ms = Some(duration_ms);
        let transition = StartupTransition {
            event: match status {
                StartupStepStatus::Success => "step_finished",
                StartupStepStatus::Warning => "step_warning",
                StartupStepStatus::Error => "step_failed",
                StartupStepStatus::Running => "step_started",
            },
            step_id: Some(step.id.clone()),
            label: step.label.clone(),
            status,
            detail: step.detail.clone(),
            elapsed_ms,
            duration_ms: Some(duration_ms),
        };
        drop(state);
        emit_transition(transition);
    }

    fn state(&self) -> MutexGuard<'_, StartupProgressState> {
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

fn optional_detail(detail: String) -> Option<String> {
    (!detail.trim().is_empty()).then_some(detail)
}

fn unix_timestamp_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn format_duration(duration_ms: u64) -> String {
    if duration_ms < 1_000 {
        return format!("{duration_ms}ms");
    }
    format!("{:.1}s", duration_ms as f64 / 1_000.0)
}

#[cfg(not(test))]
fn emit_transition(transition: StartupTransition) {
    let detail = transition.detail.as_deref().unwrap_or_default();
    let suffix = if detail.is_empty() {
        String::new()
    } else {
        format!("：{detail}")
    };
    eprintln!(
        "[Codey 启动 +{}] {}{}",
        format_duration(transition.elapsed_ms),
        transition.label,
        suffix
    );
    let _ = codey_runtime_core::diagnostic_log::append_diagnostic_log(
        "codey.startup_progress",
        json!({
            "event": transition.event,
            "stepId": transition.step_id,
            "label": transition.label,
            "status": transition.status,
            "detail": transition.detail,
            "elapsedMs": transition.elapsed_ms,
            "durationMs": transition.duration_ms,
        }),
    );
}

#[cfg(test)]
fn emit_transition(_transition: StartupTransition) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn progress_records_successful_steps_and_elapsed_time() {
        let progress = StartupProgress::default();
        progress.begin_session();
        progress.start_step("config", "读取配置", "读取本地配置");
        progress.finish_step("config", "配置已读取");
        progress.complete();

        let snapshot = progress.snapshot();
        assert_eq!(snapshot.status, StartupProgressStatus::Success);
        assert_eq!(snapshot.steps.len(), 1);
        assert_eq!(snapshot.steps[0].status, StartupStepStatus::Success);
        assert_eq!(snapshot.steps[0].detail.as_deref(), Some("配置已读取"));
        assert!(snapshot.steps[0].duration_ms.is_some());
        assert!(snapshot.finished_at_ms.is_some());
    }

    #[test]
    fn progress_failure_marks_the_latest_running_step() {
        let progress = StartupProgress::default();
        progress.begin_session();
        progress.start_step("trace", "配置 Trace 防护", "");
        progress.start_step("sessions", "修复会话索引", "");

        progress.fail("SQLite 被占用");

        let snapshot = progress.snapshot();
        assert_eq!(snapshot.status, StartupProgressStatus::Error);
        assert_eq!(snapshot.error.as_deref(), Some("SQLite 被占用"));
        assert_eq!(snapshot.steps[0].status, StartupStepStatus::Warning);
        assert_eq!(snapshot.steps[1].status, StartupStepStatus::Error);
    }

    #[test]
    fn beginning_a_new_session_discards_the_previous_trace() {
        let progress = StartupProgress::default();
        progress.begin_session();
        progress.start_step("old", "旧启动", "");
        progress.complete();

        progress.begin_session();

        let snapshot = progress.snapshot();
        assert_eq!(snapshot.status, StartupProgressStatus::Running);
        assert!(snapshot.steps.is_empty());
        assert!(snapshot.error.is_none());
    }
}
