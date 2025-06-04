import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { WhoopAPI } from './whoopAPI.js';

export class WhoopExtension {
    constructor() {
        this._configPath = GLib.build_filenamev([
            GLib.get_home_dir(),
            '.local/share/gnome-shell/extensions/whoop-info@juanmag.dev/tokens.json'
        ]);

        this._api = new WhoopAPI(this._configPath);
        this._button = new PanelMenu.Button(0.0, 'WhoopPanel', false);

        // Ruta base a los recursos de la extensión
        const extensionDir = GLib.build_filenamev([
            GLib.get_home_dir(),
            '.local/share/gnome-shell/extensions/whoop-info@juanmag.dev'
        ]);

        // Crear layout horizontal para los iconos + textos
        this._layout = new St.BoxLayout({ vertical: false, style_class: 'panel-status-menu-box' });

        // Cargar los iconos SVG
        this._iconSleep = this._createIcon(`${extensionDir}/img/sleep.svg`);
        this._iconRecovery = this._createIcon(`${extensionDir}/img/recovery.svg`);
        this._iconStrain = this._createIcon(`${extensionDir}/img/strain.svg`);

        // Crear etiquetas vacías
        this._labelSleep = new St.Label({ text: '...', y_align: Clutter.ActorAlign.CENTER });
        this._labelRecovery = new St.Label({ text: '...', y_align: Clutter.ActorAlign.CENTER });
        this._labelStrain = new St.Label({ text: '...', y_align: Clutter.ActorAlign.CENTER });

        // Añadir al layout
        this._layout.add_child(this._iconSleep);
        this._layout.add_child(this._labelSleep);
        this._layout.add_child(this._iconRecovery);
        this._layout.add_child(this._labelRecovery);
        this._layout.add_child(this._iconStrain);
        this._layout.add_child(this._labelStrain);

        this._button.add_child(this._layout);

        this._updateLoop();
        this._interval = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 900, () => {
            this._updateLoop();
            return true;
        });
    }

    _createIcon(path) {
        return new St.Icon({
            gicon: Gio.icon_new_for_string(path),
            style_class: 'system-status-icon', 
            icon_size: 18 
        });
    }

    async _updateLoop() {
        try {
            await this._api.refreshToken();
            const recovery = await this._api.fetchEndpoint('recovery');
            const sleep = await this._api.fetchEndpoint('activity/sleep');
            const strain = await this._api.fetchEndpoint('cycle');

            const recoveryScore = recovery?.records?.[0]?.score?.recovery_score ?? '-';
            const sleepPerf = sleep?.records?.[0]?.score?.sleep_performance_percentage ?? '-';
            const strainRaw = strain?.records?.[0]?.score?.strain;
            const strainText = (typeof strainRaw === 'number') ? `${(Math.round(strainRaw * 100) / 100).toFixed(2)}`: '-';

            this._labelSleep.set_text(`${sleepPerf}%`);
            this._labelRecovery.set_text(`${recoveryScore}%`);
            this._labelStrain.set_text(`${strainText}`);
        } catch (e) {
            log(`[WhoopExtension] Error en actualización: ${e.message}`);
            this._labelSleep.set_text('-');
            this._labelRecovery.set_text('-');
            this._labelStrain.set_text('-');
        }
    }

    get actor() {
        return this._button;
    }

    destroy() {
        if (this._interval) GLib.source_remove(this._interval);
        this._button.destroy();
    }
}

