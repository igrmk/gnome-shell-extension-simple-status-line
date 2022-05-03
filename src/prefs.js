const { GObject, Gtk, Gdk } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Settings = Me.imports.settings;
const Configuration = new Settings.Prefs();

const DEFAULT_SETTINGS = {
    horizontal_pattern: 'p {cpu%}% | m {mem%}% | ↓ {downMb}Mb/s | ↑ {upMb}Mb/s | b {bat%}%',
    vertical_pattern: 'p {cpu%}\\nm {mem%}\\n↓ {downMb}\\n↑ {upMb}\\nb {bat%}',
    refreshInterval: 1,
    fontFamily: 'Sans',
    fontSize: '12',
    textColor: '#DDDDDD'
};

const WIDGET_TEMPLATE_FILE = 'prefs.ui';

const N_ = function (e) {
    return e;
};

const colorToHex = (color) => {
    return N_('#%02x%02x%02x').format(
        255 * color.red,
        255 * color.green,
        255 * color.blue,
    );
}

const SimpleStatusLinePrefsWidget = GObject.registerClass({
    GTypeName: 'SimpleStatusLinePrefsWidget',
    Template: Me.dir.get_child(WIDGET_TEMPLATE_FILE).get_uri(),
    InternalChildren: [
        'pattern_text',
        'refresh_interval',
        'font_button',
        'text_color'
    ]
}, class SimpleStatusLinePrefsWidget extends Gtk.Box {
    _init() {
        super._init();
        this.update_widget_setting_values();
    }

    update_widget_setting_values() {
        this._pattern_text.set_text(Configuration.PATTERN.get());
        this._refresh_interval.set_value(Configuration.REFRESH_INTERVAL.get());
        this._font_button.set_font(`${Configuration.FONT_FAMILY.get()} ${Configuration.FONT_SIZE.get()}`);
        const color = new Gdk.RGBA();
        color.parse(Configuration.TEXT_COLOR.get());
        this._text_color.set_rgba(color);
    }

    reset_settings_to_default(horizontal) {
        Configuration.PATTERN.set(horizontal ? DEFAULT_SETTINGS.horizontal_pattern : DEFAULT_SETTINGS.vertical_pattern);
        Configuration.REFRESH_INTERVAL.set(DEFAULT_SETTINGS.refreshInterval);
        Configuration.FONT_FAMILY.set(DEFAULT_SETTINGS.fontFamily);
        Configuration.FONT_SIZE.set(DEFAULT_SETTINGS.fontSize);
        Configuration.TEXT_COLOR.set(DEFAULT_SETTINGS.textColor);
    }

    pattern_text_changed(widget) {
        Configuration.PATTERN.set(widget.get_text());
    }

    refresh_interval_changed(widget) {
        Configuration.REFRESH_INTERVAL.set(widget.get_value());
    }

    font_changed(widget) {
        const font = widget.get_font();
        const lastSpaceIndex = font.lastIndexOf(' ');
        const fontFamily = font.substring(0, lastSpaceIndex);
        const fontSize = font.substring(lastSpaceIndex, font.length);
        Configuration.FONT_FAMILY.set(fontFamily);
        Configuration.FONT_SIZE.set(fontSize);
    }

    color_changed(widget) {
        Configuration.TEXT_COLOR.set(colorToHex(widget.get_rgba()));
    }

    reset_settings_to_default_horizontal_clicked(widget) {
        this.reset_settings_to_default(true);
        this.update_widget_setting_values();
    }

    reset_settings_to_default_vertical_clicked(widget) {
        this.reset_settings_to_default(false);
        this.update_widget_setting_values();
    }
});

function init() { }

function buildPrefsWidget() {
    const widget = new SimpleStatusLinePrefsWidget();
    widget.homogeneous = true;
    if (Gtk.get_major_version() === 3) {
        widget.show_all();
    }
    return widget;
}