const { Plugin } = require('powercord/entities');
const { getModule } = require("powercord/webpack");
const { inject, uninject, isInjected } = require("powercord/injector");
const contextMenuPatch = require("./contextMenuPatch.jsx");
var _this;

module.exports = class ShowHiddenChannels extends Plugin {
    async startPlugin() {
        _this = this;

        this.patchedContexts = [];
        this.shouldShow = true;

        const ChannelList = await getModule(m => m.default && m.default.displayName == "NavigableChannels");
        const ChannelItem = await getModule(m => m.displayName == "ChannelItem");
        const contextMenuModule = await getModule(["openContextMenu"]);

        this.can = (await getModule(["can", "canEveryone"])).can;
        this._1024 = (await getModule(["Permissions"])).Permissions.VIEW_CHANNEL;
        this.currentUser = await (await getModule(["fetchCurrentUser"])).fetchCurrentUser();
        this.ChannelStore = await getModule(["getChannels"]);
        this.channelObject = await getModule(m => m.prototype && m.prototype.getGuildId && m.prototype.isManaged);
        this.channelClasses = await getModule(["modeUnread", "modeLocked"]);
        const UnreadModule = await getModule(["hasUnread", "getMentionCount"]);
        const menuModule = await getModule(["MenuItem"]);

        const patchContextMenu = contextMenuPatch({
            _1024: this._1024,
            can: this.can,
            currentUser: this.currentUser,
            menuModule,
            changeVisibility: () => { this.shouldShow = !this.shouldShow; },
            getVisibility: () => this.shouldShow
        });

        inject("show-hidden-channels_channelListPatch", ChannelList, "default", this.patchChannelList, true);
        inject("show-hidden-channels_channelItemPatch", ChannelItem.prototype, "render", this.patchChannelItem);
        inject("show-hidden-channels_unreadPatch", UnreadModule, "hasUnread", function (args, res) {
            if (_this.can(_this._1024, _this.currentUser, _this.ChannelStore.getChannel(args[0]))) return res;
            return false;
        });
        inject("show-hidden-channels_mentionsPatch", UnreadModule, "getMentionCount", function (args, res) {
            if (_this.can(_this._1024, _this.currentUser, _this.ChannelStore.getChannel(args[0]))) return res;
            return 0;
        });
        inject("show-hidden-channels_openContextMenuPatch", contextMenuModule, "openContextMenu", function (args, res) {
            const menu = args[1]();
            if (menu.type && menu.type.displayName && menu.type.displayName.startsWith("ChannelList") &&
                !_this.patchedContexts.find(e => e == menu.type.displayName)) {
                if (menu.type.prototype.render) {
                    inject(`show-hidden-channels_${menu.type.displayName}Patch`, menu.type.prototype, "render", patchContextMenu);
                } else {
                    const m = getModule(m => m.default == menu.type, false)
                    inject(`show-hidden-channels_${menu.type.displayName}Patch`, m, "default", patchContextMenu);
                }
                _this.patchedContexts.push(menu.type.displayName);
            }
            return res;
        });
    }

    pluginWillUnload() {
        if (isInjected("show-hidden-channels_channelListPatch")) uninject("show-hidden-channels_channelListPatch");
        if (isInjected("show-hidden-channels_channelItemPatch")) uninject("show-hidden-channels_channelItemPatch");
        if (isInjected("show-hidden-channels_unreadPatch")) uninject("show-hidden-channels_unreadPatch");
        if (isInjected("show-hidden-channels_mentionsPatch")) uninject("show-hidden-channels_mentionsPatch");
        if (isInjected("show-hidden-channels_openContextMenuPatch")) uninject("show-hidden-channels_openContextMenuPatch");
        this.patchedContexts.forEach((e, i, a) => {
            const id = `show-hidden-channels_${e}Patch`;
            if (isInjected(id)) uninject(id);
            a.splice(i, 1);
        });
    }

    patchChannelList(args) {
        const { _1024, can, currentUser, ChannelStore, channelObject, shouldShow } = _this;

        const channels = Object.values(ChannelStore.getChannels()).filter(c => c.guild_id == args[0].guild.id).sort((a, b) => a.position - b.position);
        const hiddenChannels = channels.filter(c => c.type != 4 && !can(_1024, currentUser, c));
        if (!shouldShow) {
            if (args[0].channels._hiddenShown) {
                return _this.cleanUpListPatch(args, hiddenChannels);
            }
            return args
        };

        hiddenChannels.forEach(v => {
            if (args[0].channels[v.type == 0 ? "SELECTABLE" : v.type].find(c => c.channel.id == v.id) ||
                args[0].categories[v.type != 4 ? (v.parent_id || "null") : "_categories"].find(c => c.channel.id == v.id)) return;
            args[0].channels[v.type == 0 ? "SELECTABLE" : v.type].push({
                channel: new channelObject(Object.assign({}, v, { unread: false })),
                comparator: v.position
            });
            if (v.type == 4) {
                args[0].categories._categories.push({
                    channel: v,
                    index: v.position
                });
            } else {
                args[0].categories[v.parent_id || "null"].push({
                    channel: new channelObject(Object.assign({}, v, { unread: false })),
                    index: v.position
                });
            }
        });

        args[0].channels._hiddenShown = true;

        return args;
    }

    cleanUpListPatch(args, hiddenChannels) {
        for (var k in args[0].channels) {
            if (!Array.isArray(args[0].channels[k])) continue;
            args[0].channels[k] = args[0].channels[k].filter(c =>
                !hiddenChannels.find(c1 => c1.id == c.channel.id)
            );
        }
        for (var k in args[0].categories) {
            args[0].categories[k] = args[0].categories[k].filter(c =>
                !hiddenChannels.find(c1 => c1.id == c.channel.id)
            );
        }
        delete args[0].channels._hiddenShown;
        return args;
    }

    patchChannelItem(args, res) {
        const { _1024, can, currentUser, channelClasses } = _this;
        if (!can(_1024, currentUser, this.props.channel)) {
            this.props.onClick = function () { };
            this.props.onMouseDown = function () { };

            const hasLocked = res.props.className.split(" ").indexOf(channelClasses.modeLocked);

            if (hasLocked == -1) {
                res.props.className = res.props.className + " " + channelClasses.modeLocked;
            }
        }

        return res;
    }
};