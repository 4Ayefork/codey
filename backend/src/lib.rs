mod cc_switch;
mod cdp;
mod codex_config;
mod codex_startup_patch;
mod commands;
mod config;
mod launcher;
mod maintenance_lock;
mod message_delete;
mod model_catalog;
mod pending_approval;
mod pet_slim_patch;
mod plugin_marketplace;
mod process_cleanup;
mod process_tree;
mod provider_lease;
mod provider_models;
mod session_delete;
mod session_index_cleanup;
mod session_metadata;
mod session_transfer;
mod startup_maintenance;
mod startup_progress;
mod trace_log_guard;
mod trace_log_stats;
mod update_helper;
mod webhook;

use std::sync::Arc;

use anyhow::{Context, Result};

use commands::{AppShutdownReason, AppState};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ShutdownReason {
    CodexExited,
    InstallUpdate,
    Signal,
}

pub fn run_update_helper_if_requested() -> Result<bool> {
    update_helper::run_if_requested().map_err(anyhow::Error::msg)
}

pub async fn run() -> Result<()> {
    if std::env::args_os()
        .nth(1)
        .is_some_and(|argument| argument == "--codey-fastctx-mcp")
    {
        fastctx::cli::run_server()
            .await
            .map(|_| ())
            .map_err(anyhow::Error::msg)?;
        return Ok(());
    }

    let state = Arc::new(AppState::default());
    state.startup_progress.begin_session();
    state.startup_progress.start_step(
        "restore_previous_state",
        "恢复上次临时配置",
        "检查异常退出后遗留的 Codex 配置租约",
    );
    if let Err(error) = launcher::restore_previous_runtime_state(&codex_config::codex_home()) {
        eprintln!("Codey 启动前恢复上次临时配置失败：{error:#}");
        state
            .startup_progress
            .warn_step("restore_previous_state", format!("{error:#}"));
    } else {
        state
            .startup_progress
            .finish_step("restore_previous_state", "临时配置状态正常");
    }
    state.startup_progress.start_step(
        "sync_current_provider",
        "读取当前线路",
        "同步 cc-switch 或本地 Codex 登录配置",
    );
    let provider_status = commands::sync_cc_switch_state(&state).await;
    let provider_message = provider_status.message;
    let local_provider_info = matches!(
        provider_message.as_deref(),
        Some("未检测到 cc-switch，已读取本地 Codex 直登配置") | Some("当前使用本地 Codex 直登配置")
    );
    if let Some(message) = provider_message {
        if local_provider_info {
            state
                .startup_progress
                .finish_step("sync_current_provider", message);
        } else {
            state
                .startup_progress
                .warn_step("sync_current_provider", message);
        }
    } else {
        state.startup_progress.finish_step(
            "sync_current_provider",
            format!("当前线路：{}", provider_status.provider.name),
        );
    }

    if let Err(error) = commands::launch_codey_runtime(&state).await {
        eprintln!("Codey 自动启动 Codex 失败：{error:#}");
    }

    let shutdown_reason = tokio::select! {
        reason = state.wait_for_shutdown() => match reason {
            AppShutdownReason::CodexExited => ShutdownReason::CodexExited,
            AppShutdownReason::InstallUpdate => ShutdownReason::InstallUpdate,
        },
        _ = shutdown_signal() => ShutdownReason::Signal,
    };

    let cleanup = match commands::stop_codey_runtime(&state).await {
        Ok(_) => Ok(()),
        Err(first_error) => {
            eprintln!("Codey 恢复 Codex 配置失败，正在重试：{first_error}");
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            commands::stop_codey_runtime(&state)
                .await
                .map(|_| ())
                .map_err(|retry_error| format!("{first_error}；重试失败：{retry_error}"))
        }
    };
    let shutdown_context = match shutdown_reason {
        ShutdownReason::CodexExited => "Codex 已退出",
        ShutdownReason::InstallUpdate => "Codey 正在安装更新",
        ShutdownReason::Signal => "Codey 收到退出信号",
    };
    match process_cleanup::terminate_other_codey_processes().await {
        Ok(0) => {}
        Ok(count) => eprintln!("{shutdown_context}，已终止 {count} 个遗留 Codey 进程"),
        Err(error) => eprintln!("{shutdown_context}，但清理遗留 Codey 进程失败：{error:#}"),
    }
    cleanup.map_err(anyhow::Error::msg)
}

async fn shutdown_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};

        match signal(SignalKind::terminate()).context("监听 SIGTERM 失败") {
            Ok(mut terminate) => {
                tokio::select! {
                    _ = tokio::signal::ctrl_c() => {}
                    _ = terminate.recv() => {}
                }
            }
            Err(error) => {
                eprintln!("{error:#}");
                let _ = tokio::signal::ctrl_c().await;
            }
        }
    }

    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}
