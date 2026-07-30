use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum NotificationChannelKind {
    #[default]
    Feishu,
    Telegram,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NotificationChannelConfig {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub kind: NotificationChannelKind,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub bot_token: String,
    #[serde(default)]
    pub bot_token_configured: bool,
    #[serde(default, skip_serializing)]
    pub clear_bot_token: bool,
    #[serde(default)]
    pub chat_id: String,
}

impl Default for NotificationChannelConfig {
    fn default() -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            kind: NotificationChannelKind::Feishu,
            enabled: true,
            url: String::new(),
            bot_token: String::new(),
            bot_token_configured: false,
            clear_bot_token: false,
            chat_id: String::new(),
        }
    }
}

impl NotificationChannelConfig {
    pub fn is_configured(&self) -> bool {
        match self.kind {
            NotificationChannelKind::Feishu => !self.url.trim().is_empty(),
            NotificationChannelKind::Telegram => {
                !self.bot_token.trim().is_empty() && !self.chat_id.trim().is_empty()
            }
        }
    }
}

/// Notification settings retain the historic `webhook` wire name in
/// `CodeyConfig` so existing installations and renderer calls remain valid.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct WebhookConfig {
    // Read the pre-channel-list format and migrate it in `normalize`. These
    // fields are deliberately omitted once the new format is serialized.
    #[serde(default)]
    #[serde(skip_serializing_if = "is_false")]
    pub enabled: bool,
    #[serde(default)]
    #[serde(skip_serializing_if = "String::is_empty")]
    pub url: String,
    #[serde(default)]
    pub channels: Vec<NotificationChannelConfig>,
}

impl WebhookConfig {
    pub(crate) fn normalize(&mut self) {
        if self.channels.is_empty() && (self.enabled || !self.url.trim().is_empty()) {
            self.channels.push(NotificationChannelConfig {
                id: "legacy-feishu".to_string(),
                kind: NotificationChannelKind::Feishu,
                enabled: self.enabled,
                url: self.url.trim().to_string(),
                ..NotificationChannelConfig::default()
            });
        }
        self.enabled = false;
        self.url.clear();

        let mut ids = BTreeSet::new();
        for channel in &mut self.channels {
            channel.id = channel.id.trim().to_string();
            if channel.id.is_empty() || !ids.insert(channel.id.clone()) {
                channel.id = Uuid::new_v4().to_string();
                ids.insert(channel.id.clone());
            }
            channel.url = channel.url.trim().to_string();
            channel.bot_token = channel.bot_token.trim().to_string();
            channel.chat_id = channel.chat_id.trim().to_string();
            channel.bot_token_configured = !channel.bot_token.is_empty();
            channel.clear_bot_token = false;
        }
    }

    pub fn has_enabled_channel(&self) -> bool {
        self.channels
            .iter()
            .any(|channel| channel.enabled && channel.is_configured())
    }

    pub fn merge_redacted_secrets(&mut self, previous: &Self) {
        for channel in &mut self.channels {
            if channel.kind != NotificationChannelKind::Telegram {
                continue;
            }
            if channel.clear_bot_token {
                channel.bot_token.clear();
                channel.bot_token_configured = false;
                continue;
            }
            if !channel.bot_token.trim().is_empty() || !channel.bot_token_configured {
                continue;
            }
            if let Some(existing) = previous.channels.iter().find(|existing| {
                existing.id == channel.id && existing.kind == NotificationChannelKind::Telegram
            }) {
                channel.bot_token = existing.bot_token.clone();
            }
        }
    }
}

fn is_false(value: &bool) -> bool {
    !*value
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn supports_multiple_channel_kinds() {
        let mut config = serde_json::from_str::<WebhookConfig>(
            r#"{
                "channels":[
                    {"id":"feishu-1","kind":"feishu","enabled":true,"url":"https://open.feishu.cn/example"},
                    {"id":"telegram-1","kind":"telegram","enabled":true,"botToken":"123:token","chatId":"-100123"}
                ]
            }"#,
        )
        .unwrap();
        config.normalize();

        assert_eq!(config.channels.len(), 2);
        assert!(config.has_enabled_channel());
        assert_eq!(config.channels[1].kind, NotificationChannelKind::Telegram);
        assert!(config.channels[1].bot_token_configured);
    }

    #[test]
    fn redacted_telegram_token_is_restored_when_other_settings_are_saved() {
        let previous = WebhookConfig {
            channels: vec![NotificationChannelConfig {
                id: "telegram-1".to_string(),
                kind: NotificationChannelKind::Telegram,
                enabled: true,
                bot_token: "123:secret".to_string(),
                bot_token_configured: true,
                chat_id: "-100123".to_string(),
                ..NotificationChannelConfig::default()
            }],
            ..WebhookConfig::default()
        };
        let mut incoming = previous.clone();
        incoming.channels[0].bot_token.clear();
        incoming.merge_redacted_secrets(&previous);

        assert_eq!(incoming.channels[0].bot_token, "123:secret");
    }

    #[test]
    fn explicit_telegram_token_clear_does_not_restore_the_previous_secret() {
        let previous = WebhookConfig {
            channels: vec![NotificationChannelConfig {
                id: "telegram-1".to_string(),
                kind: NotificationChannelKind::Telegram,
                bot_token: "123:secret".to_string(),
                bot_token_configured: true,
                chat_id: "-100123".to_string(),
                ..NotificationChannelConfig::default()
            }],
            ..WebhookConfig::default()
        };
        let mut incoming = previous.clone();
        incoming.channels[0].bot_token.clear();
        incoming.channels[0].clear_bot_token = true;
        incoming.merge_redacted_secrets(&previous);

        assert!(incoming.channels[0].bot_token.is_empty());
        assert!(!incoming.channels[0].bot_token_configured);
        assert!(
            serde_json::to_value(&incoming).unwrap()["channels"][0]
                .get("clearBotToken")
                .is_none()
        );
    }
}
