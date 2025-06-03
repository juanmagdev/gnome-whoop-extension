import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

const TOKEN_PATH = GLib.build_filenamev([
    GLib.get_user_data_dir(),
    'gnome-shell/extensions/whoop-info@juanmag.dev/tokens.json',
]);

function readTokens() {
    try {
        let [ok, content] = GLib.file_get_contents(TOKEN_PATH);
        if (!ok) throw new Error('No se pudo leer tokens.json');
        return JSON.parse(imports.byteArray.toString(content));
    } catch {
        return {
            client_id: '',
            client_secret: '',
            access_token: '',
            refresh_token: ''
        };
    }
}

function writeTokens(tokens) {
    const content = JSON.stringify(tokens, null, 4);
    GLib.file_set_contents(TOKEN_PATH, content);
}

export default class WhoopPrefsWidget extends Gtk.Box {
    constructor() {
        super({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            border_width: 12
        });

        const tokens = readTokens();

        this._entries = {};

        const fields = [
            ['client_id', 'Client ID'],
            ['client_secret', 'Client Secret'],
            ['access_token', 'Access Token'],
            ['refresh_token', 'Refresh Token']
        ];

        for (const [key, label] of fields) {
            const row = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 8
            });

            const lbl = new Gtk.Label({ label, xalign: 0 });
            const entry = new Gtk.Entry({ hexpand: true });
            entry.set_text(tokens[key] || '');

            this._entries[key] = entry;

            row.append(lbl);
            row.append(entry);
            this.append(row);
        }

        const saveButton = new Gtk.Button({ label: 'Guardar tokens' });
        saveButton.connect('clicked', () => {
            const newTokens = {};
            for (const key in this._entries) {
                newTokens[key] = this._entries[key].get_text();
            }
            writeTokens(newTokens);
        });

        this.append(saveButton);
    }
}

export function init() {
    return WhoopPrefsWidget;
}
