// extension.js
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { WhoopExtension } from './whoopExtension.js';

export default class WhoopInfoExtension extends Extension {
    enable() {
        this._whoop = new WhoopExtension(this.getSettings('org.gnome.shell.extensions.whoop-info'));
        Main.panel.addToStatusArea('whoop-panel', this._whoop.actor);
    }

    disable() {
        if (this._whoop) {
            this._whoop.destroy();
            this._whoop = null;
        }
    }
}
