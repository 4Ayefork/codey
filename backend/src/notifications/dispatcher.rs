use std::time::Duration;

#[cfg(test)]
use anyhow::Context;
use anyhow::Result;
use reqwest::{Client, StatusCode};
use serde_json::{Value, json};

use super::channels::{NotificationChannelAdapter, adapter_for};
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
                    match response.text().await {
                        Ok(response_body) => {
                            match validate_http_response(adapter.as_ref(), status, &response_body) {
                                Ok(()) => return Ok(()),
                                Err(error) => last_error = Some(error),
                            }
                        }
                        Err(error) => {
                            last_error = Some(adapter.sanitize_error(&format!(
                                "{}响应读取失败：{error}",
                                adapter.display_name()
                            )));
                        }
                    }
                }
                Err(error) => {
                    last_error = Some(adapter.sanitize_error(&error.to_string()));
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
            adapter.sanitize_error(&error)
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

fn validate_http_response(
    adapter: &dyn NotificationChannelAdapter,
    status: StatusCode,
    body: &str,
) -> std::result::Result<(), String> {
    let channel_result = adapter.validate_response(body);
    if status.is_success() {
        return channel_result.map_err(|error| adapter.sanitize_error(&error));
    }

    let error = match channel_result {
        Ok(()) => format!("{}返回 HTTP {status}", adapter.display_name()),
        Err(detail) => format!("{}返回 HTTP {status}：{detail}", adapter.display_name()),
    };
    Err(adapter.sanitize_error(&error))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notifications::NotificationChannelKind;

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

    #[test]
    fn successful_http_status_still_requires_valid_channel_confirmation() {
        let config = NotificationChannelConfig {
            kind: NotificationChannelKind::Feishu,
            url: "https://open.feishu.cn/open-apis/bot/v2/hook/secret".to_string(),
            ..NotificationChannelConfig::default()
        };
        let adapter = adapter_for(&config);

        let error =
            validate_http_response(adapter.as_ref(), StatusCode::OK, "not json").unwrap_err();

        assert!(error.contains("无法解析"));
    }

    #[test]
    fn response_errors_are_bounded_and_do_not_expose_credentials() {
        let secret_url = "https://open.feishu.cn/open-apis/bot/v2/hook/private-secret";
        let config = NotificationChannelConfig {
            kind: NotificationChannelKind::Feishu,
            url: secret_url.to_string(),
            ..NotificationChannelConfig::default()
        };
        let adapter = adapter_for(&config);
        let response = serde_json::json!({
            "code": 19021,
            "msg": format!("{secret_url} {}", "x".repeat(500)),
        })
        .to_string();

        let error = validate_http_response(adapter.as_ref(), StatusCode::BAD_REQUEST, &response)
            .unwrap_err();

        assert!(!error.contains(secret_url));
        assert!(error.contains("***"));
        assert!(error.chars().count() < 300);
    }
}
