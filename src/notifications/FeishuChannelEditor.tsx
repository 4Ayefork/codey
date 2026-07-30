import { memo } from "react";
import { IconSend } from "@tabler/icons-react";

import { Input } from "../components/semi";
import type { NotificationChannelEditorProps } from "./types";

function FeishuChannelEditorComponent({
  channel,
  onChange,
}: NotificationChannelEditorProps) {
  return (
    <label className="field">
      <span>Webhook 地址</span>
      <div className="input-shell">
        <IconSend size={15} aria-hidden="true" />
        <Input
          value={channel.url}
          onChange={(event) => onChange({ url: event.target.value })}
          placeholder="https://open.feishu.cn/..."
          spellCheck={false}
        />
      </div>
    </label>
  );
}

export const FeishuChannelEditor = memo(FeishuChannelEditorComponent);
