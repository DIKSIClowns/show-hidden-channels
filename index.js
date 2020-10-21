const { Plugin } = require("powercord/entities");
const { getModule } = require("powercord/webpack");
const { inject, uninject } = require("powercord/injector");
const contextMenuPatch = require("./contextMenuPatch.jsx");
var _this;

module.exports = class ShowHiddenChannels extends Plugin {
    async startPlugin() {
        _this = this;

        this.patchedContexts = [];
        this.patchedLists = [];
        this.shouldShow = true;

        const ChannelList = await getModule(
            m => m.default && m.default.displayName == "NavigableChannels"
        );
        const ChannelItem = await getModule(
            m => m.displayName == "ChannelItem"
        );
        const contextMenuModule = await getModule(["openContextMenu"]);

        this.can = (await getModule(["can", "canEveryone"])).can;
        this.VIEW_CHANNEL = (
            await getModule(["Permissions"])
        ).Permissions.VIEW_CHANNEL;
        this.currentUser = await (
            await getModule(["fetchCurrentUser"])
        ).fetchCurrentUser();
        this.ChannelStore = await getModule(["getChannels"]);
        this.channelObject = await getModule(
            m => m.prototype && m.prototype.getGuildId && m.prototype.isManaged
        );
        this.channelClasses = await getModule(["modeUnread", "modeLocked"]);
        const UnreadModule = await getModule(["hasUnread", "getMentionCount"]);

        const patchContextMenu = contextMenuPatch({
            VIEW_CHANNEL: this.VIEW_CHANNEL,
            can: this.can,
            currentUser: this.currentUser,
            changeVisibility: () => {
                this.shouldShow = !this.shouldShow;
                !this.shouldShow && this.cleanUpListPatches();
            },
            getVisibility: () => this.shouldShow
        });

        inject(
            "show-hidden-channels_channelListPatch",
            ChannelList,
            "default",
            this.patchChannelList,
            true
        );
        ChannelList.default.displayName = "NavigableChannels";
        inject(
            "show-hidden-channels_channelItemPatch",
            ChannelItem.prototype,
            "render",
            this.patchChannelItem
        );
        inject(
            "show-hidden-channels_unreadPatch",
            UnreadModule,
            "hasUnread",
            function (args, res) {
                if (
                    _this.can(
                        _this.VIEW_CHANNEL,
                        _this.currentUser,
                        _this.ChannelStore.getChannel(args[0])
                    )
                )
                    return res;
                return false;
            }
        );
        inject(
            "show-hidden-channels_mentionsPatch",
            UnreadModule,
            "getMentionCount",
            function (args, res) {
                if (
                    _this.can(
                        _this.VIEW_CHANNEL,
                        _this.currentUser,
                        _this.ChannelStore.getChannel(args[0])
                    )
                )
                    return res;
                return 0;
            }
        );
        inject(
            "show-hidden-channels_openContextMenuPatch",
            contextMenuModule,
            "openContextMenu",
            function (args, res) {
                const menu = args[1]();
                if (
                    menu.type &&
                    menu.type.displayName &&
                    menu.type.displayName.startsWith("ChannelList") &&
                    !_this.patchedContexts.find(e => e == menu.type.displayName)
                ) {
                    if (menu.type.prototype.render) {
                        inject(
                            `show-hidden-channels_${menu.type.displayName}Patch`,
                            menu.type.prototype,
                            "render",
                            patchContextMenu
                        );
                    } else {
                        const m = getModule(m => m.default == menu.type, false);
                        const name = menu.type.displayName;
                        inject(
                            `show-hidden-channels_${name}Patch`,
                            m,
                            "default",
                            patchContextMenu
                        );
                        m.default.displayName = name;
                    }
                    _this.patchedContexts.push(menu.type.displayName);
                }
                return res;
            }
        );
    }

    pluginWillUnload() {
        uninject("show-hidden-channels_channelListPatch");
        uninject("show-hidden-channels_channelItemPatch");
        uninject("show-hidden-channels_unreadPatch");
        uninject("show-hidden-channels_mentionsPatch");
        uninject("show-hidden-channels_openContextMenuPatch");
        this.patchedContexts.forEach((e, i, a) => {
            uninject(`show-hidden-channels_${e}Patch`);
            a.splice(i, 1);
        });
        this.cleanUpListPatches();
    }

    patchChannelList(args) {
        if (_this.patchedLists.find(v => args[0].channels == v.channels))
            return args;
        if (!_this.shouldShow) return args;
        const {
            VIEW_CHANNEL,
            can,
            currentUser,
            ChannelStore,
            channelObject
        } = _this;

        const channels = Object.values(ChannelStore.getChannels())
            .filter(c => c.guild_id == args[0].guild.id)
            .sort((a, b) => a.position - b.position);
        const hiddenChannels = channels.filter(
            c => c.type != 4 && !can(VIEW_CHANNEL, currentUser, c)
        );

        hiddenChannels.forEach(v => {
            if (
                args[0].channels[v.type == 0 ? "SELECTABLE" : v.type].find(
                    c => c.channel.id == v.id
                ) ||
                args[0].categories[
                    v.type != 4 ? v.parent_id || "null" : "_categories"
                ].find(c => c.channel.id == v.id)
            )
                return;
            args[0].channels[v.type == 0 ? "SELECTABLE" : v.type].push({
                channel: new channelObject(
                    Object.assign({}, v, { unread: false })
                ),
                comparator: v.position
            });
            if (v.type == 4) {
                args[0].categories._categories.push({
                    channel: v,
                    index: v.position
                });
            } else {
                args[0].categories[v.parent_id || "null"].push({
                    channel: new channelObject(
                        Object.assign({}, v, { unread: false })
                    ),
                    index: v.position
                });
            }
        });

        return args;
    }

    cleanUpListPatches() {
        this.patchedLists.forEach((v, i, a) => {
            const channels = Object.values(this.ChannelStore.getChannels())
                .filter(c => c.guild_id == v.guild.id)
                .sort((a, b) => a.position - b.position);
            const hiddenChannels = channels.filter(
                c => c.type != 4 && !can(this.VIEW_CHANNEL, this.currentUser, c)
            );

            for (var k in v.channels) {
                if (!Array.isArray(v.channels[k])) continue;
                v.channels[k] = v.channels[k].filter(
                    c => !hiddenChannels.find(c1 => c1.id == c.channel.id)
                );
            }
            for (var k in v.categories) {
                v.categories[k] = v.categories[k].filter(
                    c => !hiddenChannels.find(c1 => c1.id == c.channel.id)
                );
            }

            a.splice(i, 1);
        });
    }

    patchChannelItem(_, res) {
        const { VIEW_CHANNEL, can, currentUser, channelClasses } = _this;
        if (!can(VIEW_CHANNEL, currentUser, this.props.channel)) {
            this.props.onClick = function () {};
            this.props.onMouseDown = function () {};

            const hasLocked = (res.props.className || "")
                .split(" ")
                .indexOf(channelClasses.modeLocked);

            if (hasLocked == -1) {
                res.props.className =
                    res.props.className + " " + channelClasses.modeLocked;
            }
        }

        return res;
    }
};
