const { React, getModule } = require("powercord/webpack");
const { getOwnerInstance } = require("powercord/util");
const { Menu: { MenuGroup, MenuItem, MenuCheckboxItem } } = require("powercord/components");

module.exports = function (modules) {
    const { VIEW_CHANNEL, can, currentUser, changeVisibility, getVisibility } = modules;

    return function (args, res) {
        var channel, guild;
        if (args.length == 0) channel = this.props.channel, guild = this.props.guild;
        else channel = args[0].channel, guild = args[0].guild;
        res.props.children.splice(3, 0, (
            <MenuGroup>
                {(!can(VIEW_CHANNEL, currentUser, channel) && (channel.topic && channel.topic.length > 0)) ?
                    <MenuItem
                        id={"showhiddenchannels-channeltopic"}
                        label={"View Channel Topic"}
                        action={async function () {
                            const ChannelTopic = await getModule(m => m.default && m.default.displayName == "ChannelTopic");
                            ChannelTopic.default({ guild, channel }).handleOpenTopic({ target: document.body });
                        }}
                    ></MenuItem>
                    : null
                }
                <MenuCheckboxItem
                    id={"showhiddenchannels-hidehidden"}
                    label={"Hide Hidden Channels"}
                    action={function () {
                        changeVisibility();
                        getOwnerInstance(document.querySelector(`#${res.props.navId}`)).forceUpdate();
                        getModule(["dispatch"]).then(async m => {
                            const ActionTypes = (await getModule(["ActionTypes"])).ActionTypes;
                            m.dispatch({ type: ActionTypes.CHANNEL_UPDATE, channel: channel });
                        });
                    }}
                    checked={!getVisibility()}
                ></MenuCheckboxItem>
            </MenuGroup>
        ));

        return res;
    };
};