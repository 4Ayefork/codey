use std::time::Duration;

#[cfg(test)]
use anyhow::Context;
use anyhow::Result;
use reqwest::Client;
use serde_json::{Value, json};

use super::channels::adapter_for;
use super::{NotificationChannelConfig, NotificationEvent};

#[derive(Clone)]
pub struct NotificationDispatcher {
    client: Client,
    config: NotificationChannelConfig,
}

impl NotificationDispatcher {
    #[cfg(test)]
    pub fn new(config: NotificationChannelConfig) -> Result<Self> {
        let client = Client::builder()
            .user_agent("Codey/0.1")
            .connect_timeout(Duration::from_secs(3))
            .timeout(Duration::from_secs(8))
            .build()
            .context("创建通知 HTTP 客户端失败")?;
        Ok(Self::with_client(client, config))
    }

    pub fn with_client(client: Client, config: NotificationChannelConfig) -> Self {
        Self { client, config }
    }

    pub async fn send(&self, event: &NotificationEvent) -> Result<()> {
        self.send_with_attempts(event, 2).await
    }

    async fn send_with_attempts(&self, event: &NotificationEvent, attempts: u32) -> Result<()> {
        if !self.config.enabled || !self.config.is_configured() {
            return Ok(());
        }
        let adapter = adapter_for(&self.config);
        let mut last_error = None;
        for attempt in 0..attempts.max(1) {
            let request = adapter.build_request(&self.client, event)?;
            match request.send().await {
                Ok(response) => {
                    let status = response.status();
                    let response_body = response.text().await.unwrap_or_default();
                    if status.is_success() {
                        match adapter.response_error(&response_body) {
                            None => return Ok(()),
                            Some(error) => last_error = Some(error),
                        }
                    } else {
                        last_error = Some(format!(
                            "{}返回 HTTP {status}：{}",
                            adapter.display_name(),
                            response_body.chars().take(300).collect::<String>()
                        ));
                    }
                }
                Err(error) => {
                    last_error = Some(adapter.sanitize_transport_error(&error.to_string()));
                }
            }
            if attempt + 1 < attempts.max(1) {
                tokio::time::sleep(Duration::from_millis(250 * 2u64.pow(attempt))).await;
            }
        }
        let error = last_error.unwrap_or_else(|| "未知错误".to_string());
        Err(anyhow::anyhow!(
            "{}消息发送失败：{}",
            adapter.display_name(),
            adapter.sanitize_transport_error(&error)
        ))
    }

    pub async fn test(&self) -> Result<Value> {
        let adapter = adapter_for(&self.config);
        if let Some(error) = adapter.configuration_error() {
            anyhow::bail!(error);
        }
        drop(adapter);

        let event = NotificationEvent::new(
            "codey.test",
            "test-session",
            "test-profile",
            "Codex",
            0,
            None,
        )
        .with_session_name("通知渠道测试")
        .with_reasoning_effort("high");
        let mut tester = self.clone();
        tester.config.enabled = true;
        // A test click must finish promptly and report the real first error;
        // background completion notifications retain one retry.
        tester.send_with_attempts(&event, 1).await?;
        Ok(json!({"status":"ok", "eventId": event.event_id}))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_requires_a_configured_channel() {
        let dispatcher = NotificationDispatcher::new(NotificationChannelConfig::default()).unwrap();
        assert!(
            dispatcher
                .test()
                .await
                .unwrap_err()
                .to_string()
                .contains("Webhook")
        );
    }
}
