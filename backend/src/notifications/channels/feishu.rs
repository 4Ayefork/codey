use anyhow::Result;
use reqwest::{Client, RequestBuilder};
use serde_json::{Value, json};

use super::NotificationChannelAdapter;
use crate::notifications::formatting::{format_duration, format_timestamp};
use crate::notifications::{NotificationChannelConfig, NotificationEvent};

pub(super) struct FeishuChannel<'a> {
    config: &'a NotificationChannelConfig,
}

impl<'a> FeishuChannel<'a> {
    pub(super) fn new(config: &'a NotificationChannelConfig) -> Self {
        Self { config }
    }
}

impl NotificationChannelAdapter for FeishuChannel<'_> {
    fn display_name(&self) -> &'static str {
        "飞书"
    }

    fn configuration_error(&self) -> Option<&'static str> {
        self.config
            .url
            .trim()
            .is_empty()
            .then_some("请先填写飞书机器人 Webhook 地址")
    }

    fn build_request(&self, client: &Client, event: &NotificationEvent) -> Result<RequestBuilder> {
        let body = feishu_body(event)?;
        Ok(client
            .post(self.config.url.trim())
            .header("Content-Type", "application/json; charset=utf-8")
            .json(&body))
    }

    fn response_error(&self, body: &str) -> Option<String> {
        feishu_response_error(body)
    }
}

fn feishu_body(event: &NotificationEvent) -> Result<Value> {
    let (title, template) = match event.event.as_str() {
        "session.completed" => ("Codex会话完成", "green"),
        "session.failed" => ("Codex会话失败", "red"),
        "session.waiting" | "codey.test" => ("Codex会话等待介入", "orange"),
        _ => ("Codex会话等待介入", "orange"),
    };
    let session_name = feishu_markdown_value(&event.session_name, "未命名会话");
    let model = feishu_markdown_value(&event.model, "Codex");
    let reasoning_effort = feishu_markdown_value(&event.reasoning_effort, "默认");
    let sent_at = feishu_markdown_value(&format_timestamp(&event.timestamp), "未知");
    let body = json!({
        "msg_type": "interactive",
        "card": {
            "config": {"wide_screen_mode": true},
            "header": {
                "template": template,
                "title": {
                    "tag": "plain_text",
                    "content": title,
                },
            },
            "elements": [{
                "tag": "div",
                "fields": [
                    {
                        "is_short": false,
                        "text": {
                            "tag": "lark_md",
                            "content": format!("**会话标题**\n{session_name}"),
                        },
                    },
                    {
                        "is_short": true,
                        "text": {
                            "tag": "lark_md",
                            "content": format!("**使用模型**\n{model}"),
                        },
                    },
                    {
                        "is_short": true,
                        "text": {
                            "tag": "lark_md",
                            "content": format!("**推理深度**\n{reasoning_effort}"),
                        },
                    },
                    {
                        "is_short": false,
                        "text": {
                            "tag": "lark_md",
                            "content": format!("**发送时间**\n{sent_at}"),
                        },
                    },
                    {
                        "is_short": false,
                        "text": {
                            "tag": "lark_md",
                            "content": format!("**耗时**\n{}", format_duration(event.duration_ms)),
                        },
                    },
                ],
            }],
        },
    });
    Ok(body)
}

fn feishu_markdown_value(value: &str, fallback: &str) -> String {
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let value = if normalized.is_empty() {
        fallback
    } else {
        normalized.as_str()
    };
    value
        .replace('\\', "\\\\")
        .replace('*', "\\*")
        .replace('_', "\\_")
        .replace('`', "\\`")
        .replace('[', "\\[")
        .replace(']', "\\]")
        .replace('<', "＜")
        .replace('>', "＞")
}

fn feishu_response_error(body: &str) -> Option<String> {
    let value = serde_json::from_str::<Value>(body).ok()?;
    let code = value
        .get("code")
        .or_else(|| value.get("StatusCode"))
        .and_then(Value::as_i64)?;
    if code == 0 {
        return None;
    }
    let message = value
        .get("msg")
        .or_else(|| value.get("StatusMessage"))
        .and_then(Value::as_str)
        .unwrap_or("未知错误");
    Some(format!("飞书机器人返回错误 {code}：{message}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notifications::NotificationEvent;

    #[test]
    fn card_body_uses_custom_bot_schema() {
        let mut event =
            NotificationEvent::new("session.completed", "s1", "p1", "gpt-5.4", 192_300, None)
                .with_session_name("发布 Codey 版本")
                .with_reasoning_effort("xhigh");
        event.timestamp = "2026-07-21 20:30:00".to_string();
        let body = feishu_body(&event).unwrap();
        assert_eq!(body["msg_type"], "interactive");
        assert_eq!(body["card"]["header"]["title"]["content"], "Codex会话完成");
        assert_eq!(body["card"]["header"]["template"], "green");
        let fields = body["card"]["elements"][0]["fields"].as_array().unwrap();
        assert_eq!(fields.len(), 5);
        assert!(
            fields[0]["text"]["content"]
                .as_str()
                .unwrap()
                .contains("会话标题")
        );
        assert!(
            fields[0]["text"]["content"]
                .as_str()
                .unwrap()
                .contains("发布 Codey 版本")
        );
        assert!(
            fields[1]["text"]["content"]
                .as_str()
                .unwrap()
                .contains("gpt-5.4")
        );
        assert!(
            fields[2]["text"]["content"]
                .as_str()
                .unwrap()
                .contains("xhigh")
        );
        assert!(
            fields[3]["text"]["content"]
                .as_str()
                .unwrap()
                .contains("发送时间")
        );
        assert!(
            fields[3]["text"]["content"]
                .as_str()
                .unwrap()
                .contains("2026-07-21 20:30:00")
        );
        assert!(
            fields[4]["text"]["content"]
                .as_str()
                .unwrap()
                .contains("3 分 12 秒")
        );
        assert!(body.get("content").is_none());
        let serialized = serde_json::to_string(&body).unwrap();
        assert!(!serialized.contains("\"session_id\""));
        assert!(!serialized.contains("\"profile_id\""));
        assert!(!serialized.contains("\"error\""));
        assert!(body.get("sign").is_none());
    }

    #[test]
    fn waiting_and_failure_cards_have_distinct_titles_and_colors() {
        let waiting = NotificationEvent::new("session.waiting", "s1", "p1", "Codex", 0, None);
        let waiting_body = feishu_body(&waiting).unwrap();
        assert_eq!(
            waiting_body["card"]["header"]["title"]["content"],
            "Codex会话等待介入"
        );
        assert_eq!(waiting_body["card"]["header"]["template"], "orange");

        let failed = NotificationEvent::new("session.failed", "s1", "p1", "Codex", 500, None);
        let failed_body = feishu_body(&failed).unwrap();
        assert_eq!(
            failed_body["card"]["header"]["title"]["content"],
            "Codex会话失败"
        );
        assert_eq!(failed_body["card"]["header"]["template"], "red");
    }

    #[test]
    fn response_checks_business_error_code() {
        assert!(feishu_response_error(r#"{"code":0,"msg":"success"}"#).is_none());
        assert!(
            feishu_response_error(r#"{"code":19021,"msg":"sign fail"}"#)
                .unwrap()
                .contains("19021")
        );
    }
}
