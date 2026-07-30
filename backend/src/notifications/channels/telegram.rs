use anyhow::Result;
use reqwest::{Client, RequestBuilder};
use serde_json::{Value, json};

use super::NotificationChannelAdapter;
use crate::notifications::formatting::{format_duration, format_timestamp, plain_text_value};
use crate::notifications::{NotificationChannelConfig, NotificationEvent};

pub(super) struct TelegramChannel<'a> {
    config: &'a NotificationChannelConfig,
}

impl<'a> TelegramChannel<'a> {
    pub(super) fn new(config: &'a NotificationChannelConfig) -> Self {
        Self { config }
    }
}

impl NotificationChannelAdapter for TelegramChannel<'_> {
    fn display_name(&self) -> &'static str {
        "Telegram"
    }

    fn configuration_error(&self) -> Option<&'static str> {
        if self.config.bot_token.trim().is_empty() {
            Some("请先填写 Telegram Bot Token")
        } else if self.config.chat_id.trim().is_empty() {
            Some("请先填写 Telegram Chat ID")
        } else {
            None
        }
    }

    fn build_request(&self, client: &Client, event: &NotificationEvent) -> Result<RequestBuilder> {
        Ok(client
            .post(telegram_url(&self.config.bot_token))
            .header("Content-Type", "application/json; charset=utf-8")
            .json(&telegram_body(event, &self.config.chat_id)))
    }

    fn response_error(&self, body: &str) -> Option<String> {
        telegram_response_error(body)
    }

    fn sanitize_transport_error(&self, error: &str) -> String {
        let token = self.config.bot_token.trim();
        if token.is_empty() {
            error.to_string()
        } else {
            error.replace(token, "***")
        }
    }
}

fn telegram_url(bot_token: &str) -> String {
    format!(
        "https://api.telegram.org/bot{}/sendMessage",
        bot_token.trim()
    )
}

fn telegram_body(event: &NotificationEvent, chat_id: &str) -> Value {
    json!({
        "chat_id": chat_id.trim(),
        "text": telegram_text(event),
        "disable_web_page_preview": true,
    })
}

fn telegram_text(event: &NotificationEvent) -> String {
    let title = match event.event.as_str() {
        "session.completed" => "✅ Codex 会话完成",
        "session.failed" => "❌ Codex 会话失败",
        "session.waiting" => "⏳ Codex 会话等待介入",
        "codey.test" => "🔔 Codey 通知测试",
        _ => "🔔 Codex 会话通知",
    };
    let session_name = plain_text_value(&event.session_name, "未命名会话");
    let model = plain_text_value(&event.model, "Codex");
    let reasoning_effort = plain_text_value(&event.reasoning_effort, "默认");
    let sent_at = plain_text_value(&format_timestamp(&event.timestamp), "未知");
    format!(
        "{title}\n\n会话标题：{session_name}\n使用模型：{model}\n推理深度：{reasoning_effort}\n发送时间：{sent_at}\n耗时：{}",
        format_duration(event.duration_ms)
    )
}

fn telegram_response_error(body: &str) -> Option<String> {
    let value = serde_json::from_str::<Value>(body).ok()?;
    if value.get("ok").and_then(Value::as_bool) == Some(true) {
        return None;
    }
    let error_code = value
        .get("error_code")
        .and_then(Value::as_i64)
        .map(|code| code.to_string())
        .unwrap_or_else(|| "未知".to_string());
    let description = value
        .get("description")
        .and_then(Value::as_str)
        .unwrap_or("未知错误");
    Some(format!(
        "Telegram Bot API 返回错误 {error_code}：{description}"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notifications::NotificationEvent;

    #[test]
    fn message_uses_bot_api_schema_without_internal_ids() {
        let mut event =
            NotificationEvent::new("session.completed", "s1", "p1", "gpt-5.4", 61_000, None)
                .with_session_name("发布 Codey 版本")
                .with_reasoning_effort("high");
        event.timestamp = "2026-07-21 20:30:00".to_string();

        let body = telegram_body(&event, "-1001234567890");
        assert_eq!(body["chat_id"], "-1001234567890");
        assert_eq!(body["disable_web_page_preview"], true);
        let text = body["text"].as_str().unwrap();
        assert!(text.contains("Codex 会话完成"));
        assert!(text.contains("发布 Codey 版本"));
        assert!(text.contains("gpt-5.4"));
        assert!(text.contains("1 分 1 秒"));
        assert!(!text.contains("s1"));
        assert!(!text.contains("p1"));
    }

    #[test]
    fn response_checks_bot_api_error() {
        assert!(telegram_response_error(r#"{"ok":true,"result":{}}"#).is_none());
        assert!(
            telegram_response_error(
                r#"{"ok":false,"error_code":400,"description":"Bad Request: chat not found"}"#
            )
            .unwrap()
            .contains("chat not found")
        );
    }

    #[test]
    fn configuration_requires_token_and_chat_id() {
        let mut config = NotificationChannelConfig {
            kind: crate::notifications::NotificationChannelKind::Telegram,
            ..NotificationChannelConfig::default()
        };
        let channel = TelegramChannel::new(&config);
        assert_eq!(
            channel.configuration_error(),
            Some("请先填写 Telegram Bot Token")
        );
        config.bot_token = "123:token".to_string();
        let channel = TelegramChannel::new(&config);
        assert_eq!(
            channel.configuration_error(),
            Some("请先填写 Telegram Chat ID")
        );
    }

    #[test]
    fn transport_errors_do_not_expose_the_bot_token() {
        let config = NotificationChannelConfig {
            kind: crate::notifications::NotificationChannelKind::Telegram,
            bot_token: "123456:secret-token".to_string(),
            ..NotificationChannelConfig::default()
        };
        let channel = TelegramChannel::new(&config);

        let error = channel.sanitize_transport_error(
            "request to https://api.telegram.org/bot123456:secret-token/sendMessage failed",
        );

        assert!(!error.contains("123456:secret-token"));
        assert!(error.contains("***"));
    }
}
