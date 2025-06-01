// whoopExtension.js
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
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
        this._label = new St.Label({ text: '🌀 Cargando...', y_align: Clutter.ActorAlign.CENTER });
        this._button.add_child(this._label);

        this._updateLoop();
        this._interval = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 180, () => {
            this._updateLoop();
            return true;
        });
    }

    async _updateLoop() {
        try {
            await this._api.refreshToken();
            const recovery = await this._api.fetchEndpoint('recovery');
            const sleep = await this._api.fetchEndpoint('activity/sleep');
            const strain = await this._api.fetchEndpoint('cycle');
            console.log('[WhoopExtension] Datos obtenidos:', strain);

            const recoveryScore = recovery?.records?.[0]?.score?.recovery_score ?? '-';
            const sleepPerf = sleep?.records?.[0]?.score?.sleep_performance_percentage ?? '-';
            const strainRaw = strain?.records?.[0]?.score?.strain;
            const strainText = (typeof strainRaw === 'number') ? `${(Math.round(strainRaw * 100) / 100).toFixed(2)}`: '-';
            console.log('[WhoopExtension] Datos procesados:', {
                recoveryScore,
                sleepPerf,
                strainText
            });

            this._label.set_text(
                `💤 ${sleepPerf}% | ❤️ ${recoveryScore}% | 🏋️‍♂️ ${strainText}`
            );


        } catch (e) {
            log(`[WhoopExtension] Error en actualización: ${e.message}`);
            this._label.set_text('⚠️ Error');
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
