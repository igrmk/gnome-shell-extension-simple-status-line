/* exported init */

const { GObject, St, Clutter, GLib, Gio } = imports.gi;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Settings = Me.imports.settings;
const Util = imports.misc.util;
const Decoder = new TextDecoder('utf-8');

let lastTotalNetDownBytes = 0;
let lastTotalNetUpBytes = 0;
let lastCpuUsed = 0;
let lastCpuTotal = 0;

// See <https://github.com/AlynxZhou/gnome-shell-extension-net-speed>.
const getCurrentNetSpeed = (refreshInterval) => {
    const netSpeed = { 'down': 0, 'up': 0 };

    try {
        const inputFile = Gio.File.new_for_path('/proc/net/dev');
        const fileInputStream = inputFile.read(null);
        // See <https://gjs.guide/guides/gobject/basics.html#gobject-construction>.
        // If we want new operator, we need to pass params in object.
        // Short param is only used for static constructor.
        const dataInputStream = new Gio.DataInputStream({
            'base_stream': fileInputStream
        });

        // Caculate the sum of all interfaces' traffic line by line.
        let totalDownBytes = 0;
        let totalUpBytes = 0;
        let line = null;
        let length = 0;

        // See <https://gjs-docs.gnome.org/gio20~2.66p/gio.datainputstream#method-read_line>.
        while (([line, length] = dataInputStream.read_line(null)) && line != null) {
            line = Decoder.decode(line);
            const fields = line.split(/\W+/);
            if (fields.length <= 2) {
                break;
            }

            // Skip virtual interfaces.
            const networkInterface = fields[0];
            const currentInterfaceDownBytes = Number.parseInt(fields[1]);
            const currentInterfaceUpBytes = Number.parseInt(fields[9]);
            if (networkInterface == 'lo' ||
                // Created by python-based bandwidth manager "traffictoll".
                networkInterface.match(/^ifb[0-9]+/) ||
                // Created by lxd container manager.
                networkInterface.match(/^lxdbr[0-9]+/) ||
                networkInterface.match(/^virbr[0-9]+/) ||
                networkInterface.match(/^br[0-9]+/) ||
                networkInterface.match(/^vnet[0-9]+/) ||
                networkInterface.match(/^tun[0-9]+/) ||
                networkInterface.match(/^tap[0-9]+/) ||
                isNaN(currentInterfaceDownBytes) ||
                isNaN(currentInterfaceUpBytes)) {
                continue;
            }

            totalDownBytes += currentInterfaceDownBytes;
            totalUpBytes += currentInterfaceUpBytes;
        }

        fileInputStream.close(null);

        if (lastTotalNetDownBytes === 0) {
            lastTotalNetDownBytes = totalDownBytes;
        }
        if (lastTotalNetUpBytes === 0) {
            lastTotalNetUpBytes = totalUpBytes;
        }

        netSpeed['down'] = (totalDownBytes - lastTotalNetDownBytes) / refreshInterval;
        netSpeed['up'] = (totalUpBytes - lastTotalNetUpBytes) / refreshInterval;

        lastTotalNetDownBytes = totalDownBytes;
        lastTotalNetUpBytes = totalUpBytes;
    } catch (e) {
        logError(e);
    }

    return netSpeed;
};

// See <https://stackoverflow.com/a/9229580>.
const getCurrentCpuUsage = () => {
    let currentCpuUsage = 0;

    try {
        const inputFile = Gio.File.new_for_path('/proc/stat');
        const fileInputStream = inputFile.read(null);
        const dataInputStream = new Gio.DataInputStream({
            'base_stream': fileInputStream
        });

        let currentCpuUsed = 0;
        let currentCpuTotal = 0;
        let line = null;
        let length = 0;

        while (([line, length] = dataInputStream.read_line(null)) && line != null) {
            line = Decoder.decode(line);
            const fields = line.split(/\W+/);

            if (fields.length < 2) {
                continue;
            }

            const itemName = fields[0];
            if (itemName == 'cpu' && fields.length >= 5) {
                const user = Number.parseInt(fields[1]);
                const system = Number.parseInt(fields[3]);
                const idle = Number.parseInt(fields[4]);
                currentCpuUsed = user + system;
                currentCpuTotal = user + system + idle;
                break;
            }
        }

        fileInputStream.close(null);

        // Avoid divide by zero
        if (currentCpuTotal - lastCpuTotal !== 0) {
            currentCpuUsage = (currentCpuUsed - lastCpuUsed) / (currentCpuTotal - lastCpuTotal);
        }

        lastCpuTotal = currentCpuTotal;
        lastCpuUsed = currentCpuUsed;
    } catch (e) {
        logError(e);
    }
    return currentCpuUsage;
}

const getCurrentMemoryUsage = () => {
    let currentMemoryUsage = 0;

    try {
        const inputFile = Gio.File.new_for_path('/proc/meminfo');
        const fileInputStream = inputFile.read(null);
        const dataInputStream = new Gio.DataInputStream({
            'base_stream': fileInputStream
        });

        let memTotal = -1;
        let memAvailable = -1;
        let line = null;
        let length = 0;

        while (([line, length] = dataInputStream.read_line(null)) && line != null) {
            line = Decoder.decode(line);
            const fields = line.split(/\W+/);

            if (fields.length < 2) {
                break;
            }

            const itemName = fields[0];
            const itemValue = Number.parseInt(fields[1]);

            if (itemName == 'MemTotal') {
                memTotal = itemValue;
            }

            if (itemName == 'MemAvailable') {
                memAvailable = itemValue;
            }

            if (memTotal !== -1 && memAvailable !== -1) {
                break;
            }
        }

        fileInputStream.close(null);

        if (memTotal !== -1 && memAvailable !== -1) {
            const memUsed = memTotal - memAvailable;
            currentMemoryUsage = memUsed / memTotal;
        }
    } catch (e) {
        logError(e);
    }
    return currentMemoryUsage;
}

const getCurrentBatteryCharge = () => {
    let chargeNow = 0;

    try {
        const inputFile = Gio.File.new_for_path('/sys/class/power_supply/BAT0/charge_now');
        const [, contents,] = inputFile.load_contents(null);
        const str = Decoder.decode(contents);
        chargeNow = Number.parseInt(str);
    } catch (e) {
        logError(e);
    }

    try {
        const inputFile = Gio.File.new_for_path('/sys/class/power_supply/BAT0/charge_full');
        const [, contents,] = inputFile.load_contents(null);
        const str = Decoder.decode(contents);
        const chargeFull = Number.parseInt(str);
        return chargeNow / chargeFull;
    } catch (e) {
        logError(e);
    }

    return 0
}

const formatAsPercent = (usage) => {
    return Math.round(usage * 100).toString();
}

const Indicator = GObject.registerClass(
    class Indicator extends PanelMenu.Button {
        _init() {
            super._init(0.0, 'Simple Status Line');

            this._label = new St.Label({
                'y_align': Clutter.ActorAlign.CENTER,
                'text': 'Initialization',
            });

            this.add_child(this._label);

            let settingMenuItem = new PopupMenu.PopupMenuItem('Setting');
            settingMenuItem.connect('activate', () => {
                if (typeof ExtensionUtils.openPrefs === 'function') {
                    ExtensionUtils.openPrefs();
                } else {
                    Util.spawn(["gnome-shell-extension-prefs", Me.uuid]);
                }
            });
            this.menu.addMenuItem(settingMenuItem);
        }

        setFontStyle(fontFamily, fontSize, textColor) {
            return this._label.set_style(`font-family: "${fontFamily}";font-size: ${fontSize}px; color: ${textColor};`);
        }

        setText(text) {
            return this._label.set_text(text);
        }
    }
);


class Extension {
    constructor(uuid) {
        this._uuid = uuid;
    }

    enable() {
        lastTotalNetDownBytes = 0;
        lastTotalNetUpBytes = 0;
        lastCpuUsed = 0;
        lastCpuTotal = 0;

        this._prefs = new Settings.Prefs();
        this._pattern = this._prefs.PATTERN.get();
        this._refresh_interval = this._prefs.REFRESH_INTERVAL.get();
        this._indicator = new Indicator();
        this._update_text_style();
        Main.panel.addToStatusArea(this._uuid, this._indicator, 0, 'right');
        this._timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT_IDLE, this._refresh_interval, this._refresh_monitor.bind(this));
        this._listen_setting_change();
    }

    disable() {
        this._destory_setting_change_listener();
        if (this._indicator != null) {
            this._indicator.destroy();
            this._indicator = null;
        }
        if (this._timeout != null) {
            GLib.source_remove(this._timeout);
            this._timeout = null;
        }
    }

    _update_text_style() {
        this._indicator.setFontStyle(this._prefs.FONT_FAMILY.get(), this._prefs.FONT_SIZE.get(), this._prefs.TEXT_COLOR.get());
    }

    _refresh_monitor() {
        let text = this._pattern.replace(/\\n/g, '\n');
        if (text.includes('{cpu%}')) {
            let currentCpuUsage = getCurrentCpuUsage(this._refresh_interval);
            text = text.replace(/{cpu%}/g, formatAsPercent(currentCpuUsage))
        }
        if (text.includes('{mem%}')) {
            let currentMemoryUsage = getCurrentMemoryUsage();
            text = text.replace(/{mem%}/g, formatAsPercent(currentMemoryUsage))
        }
        if (text.includes('{downMb}') || text.includes('{upMb}')) {
            let currentNetSpeed = getCurrentNetSpeed(this._refresh_interval);
            text = text.replace(/{downMb}/g, Math.round(currentNetSpeed.down / 1000000))
            text = text.replace(/{upMb}/g, Math.round(currentNetSpeed.up / 1000000))
        }
        if (text.includes('{bat%}')) {
            let currentBatteryCharge = getCurrentBatteryCharge();
            text = text.replace(/{bat%}/g, formatAsPercent(currentBatteryCharge))
        }
        this._indicator.setText(text);
        return GLib.SOURCE_CONTINUE;
    }

    _listen_setting_change() {
        this._prefs.PATTERN.changed(() => {
            this._pattern = this._prefs.PATTERN.get();
        });

        this._prefs.FONT_FAMILY.changed(() => this._update_text_style());
        this._prefs.FONT_SIZE.changed(() => this._update_text_style());
        this._prefs.TEXT_COLOR.changed(() => this._update_text_style());

        this._prefs.REFRESH_INTERVAL.changed(() => {
            this._refresh_interval = this._prefs.REFRESH_INTERVAL.get();
            if (this._timeout != null) {
                GLib.source_remove(this._timeout);
            }
            this._timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT_IDLE, this._refresh_interval, this._refresh_monitor.bind(this));
        });
    }

    _destory_setting_change_listener() {
        this._prefs.PATTERN.disconnect();
        this._prefs.REFRESH_INTERVAL.disconnect();
        this._prefs.FONT_FAMILY.disconnect();
        this._prefs.FONT_SIZE.disconnect();
        this._prefs.TEXT_COLOR.disconnect();
    }
}

function init(meta) {
    return new Extension(meta.uuid);
}
