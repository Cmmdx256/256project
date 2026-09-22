import { Button, Flex, Tooltip } from "antd";
import { SwapOutlined } from "@ant-design/icons";
import { SettingsModalButton } from "./SettingsModal";
import VersionSelector from "./VersionSelector";
import { diffView } from "../logic/State";
import { DownloadButton } from "./DownloadButton";

const Header = () => {
    return (
        <div className="p256-header">
            <Flex align="center" gap={6} wrap={false} style={{ width: "100%", minWidth: 0, overflowX: "auto", overflowY: "hidden" }}>
                {/* Logo */}
                <span className="p256-header-logo" style={{ flexShrink: 0 }}>256</span>

                {/* Controls — shrink-wrap, don't let them overlap */}
                <Flex align="center" gap={6} wrap={false} style={{ flex: "0 0 auto" }}>
                    <div style={{ flexShrink: 0 }}>
                        <VersionSelector />
                    </div>
                    <Tooltip title="Compare versions">
                        <Button
                            icon={<SwapOutlined />}
                            onClick={() => diffView.next(true)}
                            style={{ flexShrink: 0 }}
                        >
                            Compare
                        </Button>
                    </Tooltip>
                    <div style={{ flexShrink: 0 }}>
                        <DownloadButton />
                    </div>
                    <div style={{ flexShrink: 0 }}>
                        <SettingsModalButton />
                    </div>
                </Flex>
            </Flex>
        </div>
    );
};

export default Header;
