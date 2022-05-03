const ExtensionUtils = imports.misc.extensionUtils;

const SETTING_SCHEMA = 'org.gnome.shell.extensions.simple-status-line';

var Prefs = class Prefs {
    constructor() {
        const settings = ExtensionUtils.getSettings(SETTING_SCHEMA);

        this.PATTERN = new PrefValue(settings, 'pattern', 'string');
        this.REFRESH_INTERVAL = new PrefValue(settings, 'refresh-interval', 'int');
        this.FONT_FAMILY = new PrefValue(settings, 'font-family', 'string');
        this.FONT_SIZE = new PrefValue(settings, 'font-size', 'string');
        this.TEXT_COLOR = new PrefValue(settings, 'text-color', 'string');
    }
}

class PrefValue {
    constructor(gioSettings, key, type) {
        this._gioSettings = gioSettings;
        this._key = key;
        this._type = type;
        this._changedListenerId = -1;
    }

    get() {
        return this._gioSettings[`get_${this._type}`](this._key);
    }

    set(v) {
        return this._gioSettings[`set_${this._type}`](this._key, v);
    }

    changed(callback) {
        this._changedListenerId = this._gioSettings.connect(`changed::${this._key}`, callback);
        return this._changedListenerId;
    }

    disconnect() {
        if (this._changedListenerId > 0) {
            this._gioSettings.disconnect(this._changedListenerId);
        }
    }
}