mod feishu;
mod telegram;

use anyhow::Result;
use reqwest::{Client, RequestBuilder};

use super::{NotificationChannelConfig, NotificationChannelKind, NotificationEvent};

pub(super) trait NotificationChannelAdapter: Send + Sync {
    fn display_name(&self) -> &'static str;
    fn configuration_error(&self) -> Option<&'static str>;
    fn build_request(&self, client: &Client, event: &NotificationEvent) -> Result<RequestBuilder>;
    fn response_error(&self, body: &str) -> Option<String>;
    fn sanitize_transport_error(&self, error: &str) -> String;
}

pub(super) fn adapter_for(
    config: &NotificationChannelConfig,
) -> Box<dyn NotificationChannelAdapter + '_> {
    match config.kind {
        NotificationChannelKind::Feishu => Box::new(feishu::FeishuChannel::new(config)),
        NotificationChannelKind::Telegram => Box::new(telegram::TelegramChannel::new(config)),
    }
}
