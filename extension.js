import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Soup from 'gi://Soup?version=3.0';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const ByteArray = imports.byteArray;

class WhoopExtension {
    constructor() {
        this._configPath = GLib.build_filenamev([
            '/home/juanma/.local/share/gnome-shell/extensions/whoop-info@juanmag.dev/tokens.json'
        ]);
        log('[WhoopExtension] Constructor iniciado');

        this._button = new PanelMenu.Button(0.0, 'WhoopSleep', false);

        this._label = new St.Label({
            text: 'Sleep: 0%',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._button.add_child(this._label);
        this._tokens = null;

        this._loadTokens();
        if (!this._tokens)  {
            log('[WhoopExtension] No se encontraron tokens, no se puede actualizar');
            this._updateLabel('-');
            return;
        }

        if (this._tokens.refresh_token && this._tokens.client_id && this._tokens.client_secret) {
            log('[WhoopExtension] Intentando refrescar token...');
            this._refreshToken(this._tokens.refresh_token, this._tokens.client_id, this._tokens.client_secret)
                .then(() => {
                    log('[WhoopExtension] Token refrescado correctamente');
                    this._updateLabel('Cargando...');
                    // this._getSleepPerformance(this._tokens.access_token);
                    this._getRecoveryPerformance(this._tokens.access_token);

                })
                .catch(err => {
                    log('[WhoopExtension] Error refrescando token: ' + err);
                });
        } else {
            log('[WhoopExtension] No se pueden refrescar los tokens, faltan datos necesarios');
        }
        log('[WhoopExtension] Tokens cargados: ' + JSON.stringify(this._tokens));

        this._interval = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 180, () => {
            this._updateLabel('    Cargando...');

            log('[WhoopExtension] Timeout para actualizar tokens ejecutado');
            if (this._tokens.refresh_token && this._tokens.client_id && this._tokens.client_secret) {
            log('[WhoopExtension] Intentando refrescar token...');
            this._refreshToken(this._tokens.refresh_token, this._tokens.client_id, this._tokens.client_secret)
                .then(() => {
                    log('[WhoopExtension] Token refrescado correctamente');
                    // this._getSleepPerformance(this._tokens.access_token);
                    this._getRecoveryPerformance(this._tokens.access_token);

                })
                .catch(err => {
                    log('[WhoopExtension] Error refrescando token: ' + err);
                });
        } else {
            log('[WhoopExtension] No se pueden refrescar los tokens, faltan datos necesarios');
        }
            return true;
        });
    }

    get actor() {
        return this._button;
    }

    _loadTokens() {
        log('[WhoopExtension] Cargando tokens...');
        try {
            let [ok, contents] = GLib.file_get_contents(this._configPath);
            if (!ok) throw new Error('No se pudo leer tokens.json');
            this._tokens = JSON.parse(ByteArray.toString(contents));
            log('[WhoopExtension] Tokens cargados: ' + JSON.stringify(this._tokens));
        } catch (e) {
            log('[WhoopExtension] Error leyendo tokens.json: ' + e.message);
            this._tokens = null;
        }
    }

    _saveTokens() {
        try {
            if (!this._tokens.access_token || !this._tokens.refresh_token) {
                log('[WhoopExtension] ⚠️ No se guardan tokens incompletos');
                return;
            }
            let path = GLib.build_filenamev([
                '/home/juanma/.local/share/gnome-shell/extensions/whoop-info@juanmag.dev/tokens.json'
            ]);
            let data = JSON.stringify(this._tokens, null, 4);
            console.log('[WhoopExtension] Guardando tokens en: ' + path);
            log('[WhoopExtension] Datos a guardar: ' + data);
            GLib.file_set_contents(path, data);
            log('[WhoopExtension] Tokens guardados correctamente');
        } catch (e) {
            log('[WhoopExtension] Error guardando tokens: ' + e.message);
            }
        }

    _refreshToken(refreshToken, clientId, clientSecret) {
    log('[WhoopExtension] _refreshToken iniciado');
    return new Promise((resolve, reject) => {
        const url = 'https://api.prod.whoop.com/oauth/oauth2/token';

        const bodyObj = {
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
            scope: 'offline'
        };

        function encodeFormData(data) {
            return Object.entries(data)
                .map(([key, value]) =>
                    encodeURIComponent(key) + '=' + encodeURIComponent(value))
                .join('&');
        }

        const requestBody = encodeFormData(bodyObj);

        const encoder = new TextEncoder();
        const bytes = encoder.encode(requestBody);
        const gbytes = new GLib.Bytes(bytes);

        let message = Soup.Message.new('POST', url);
        message.set_request_body_from_bytes('application/x-www-form-urlencoded', gbytes);

        let session = new Soup.Session();

        session.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            null,
            (sess, res) => {
                try {
                    let responseBytes = session.send_and_read_finish(res);
                    let decoder = new TextDecoder('utf-8');
                    let responseJson = decoder.decode(responseBytes.get_data());
                    let data = JSON.parse(responseJson);
                    log('[WhoopExtension] Token refrescado correctamente: ' + JSON.stringify(data));

                    if (data.access_token)
                        this._tokens.access_token = data.access_token;
                    else
                        log('[WhoopExtension] ⚠️ La respuesta no contiene access_token');

                    if (data.refresh_token)
                        this._tokens.refresh_token = data.refresh_token;
                    else
                        log('[WhoopExtension] ⚠️ La respuesta no contiene refresh_token');

                    this._saveTokens();

                    resolve(data);
                } catch (e) {
                    log('[WhoopExtension] Error parseando respuesta: ' + e.message);
                    reject(e);
                }
            }
        );
    });
    }

    // _getSleepPerformance(accessToken) {
    //     log('[WhoopExtension] _getSleepPerformance iniciado con token: ' + accessToken);

    //     return new Promise((resolve, reject) => {
    //         const url = 'https://api.prod.whoop.com/developer/v1/activity/sleep';

    //         let session = new Soup.Session();
    //         let message = Soup.Message.new('GET', url);
    //         message.request_headers.append('Authorization', `Bearer ${accessToken}`);

    //         session.send_and_read_async(
    //             message,
    //             GLib.PRIORITY_DEFAULT,
    //             null,
    //             (sess, res) => {
    //                 try {
    //                     let bytes = session.send_and_read_finish(res);
    //                     let decoder = new TextDecoder('utf-8');
    //                     let response = decoder.decode(bytes.get_data());
    //                     log('[WhoopExtension] Respuesta recibida en sleep: ' + response);

    //                     let data = JSON.parse(response);

    //                     if (!data.records || !data.records.length) {
    //                         log('[WhoopExtension] ⚠️ Respuesta sin datos de sueño');
    //                         reject(new Error('No hay registros en la respuesta'));
    //                         return;
    //                     }

    //                     let porcentaje = data.records[0].score.sleep_performance_percentage;

    //                     if (porcentaje === undefined) {
    //                         log('[WhoopExtension] ⚠️ No se encontró sleep_performance_percentage');
    //                         reject(new Error('Campo sleep_performance_percentage ausente'));
    //                         return;
    //                     }

    //                     this._updateLabel(porcentaje);

    //                     resolve(porcentaje);
    //                 } catch (e) {
    //                     log('[WhoopExtension] Error en _getSleepPerformance: ' + e.message);
    //                     reject(e);
    //                 }
    //             }
    //         );
    //     });
    // }

        _getRecoveryPerformance(accessToken) {
            log('[WhoopExtension] _getRecoveryPerformance iniciado con token: ' + accessToken);

            return new Promise((resolve, reject) => {
                const url = 'https://api.prod.whoop.com/developer/v1/recovery';

                let session = new Soup.Session();
                let message = Soup.Message.new('GET', url);
                message.request_headers.append('Authorization', `Bearer ${accessToken}`);


                session.send_and_read_async(
                    message,
                    GLib.PRIORITY_DEFAULT,
                    null,
                    (sess, res) => {
                        try {
                            let bytes = session.send_and_read_finish(res);
                            let decoder = new TextDecoder('utf-8');
                            let response = decoder.decode(bytes.get_data());
                            log('[WhoopExtension] Respuesta recibida en recovery: ' + response);

                            let data = JSON.parse(response);

                            if (!data.records || !data.records.length) {
                                log('[WhoopExtension] ⚠️ Respuesta sin datos de recuperación');
                                reject(new Error('No hay registros en la respuesta'));
                                return;
                            }

                            let porcentaje = data.records[0].score.recovery_score;

                            if (porcentaje === undefined) {
                                log('[WhoopExtension] ⚠️ No se encontró recovery_score');
                                reject(new Error('Campo recovery_score ausente'));
                                return;
                            }

                            this._updateLabel(porcentaje);

                            resolve(porcentaje);
                        } catch (e) {
                            log('[WhoopExtension] Error en _getRecoveryPerformance: ' + e.message);
                            reject(e);
                        }
                    }
                );
            });
        }


    _updateLabel(value) {
        log('[WhoopExtension] Actualizando etiqueta: ' + value);
        // this._label.set_text(💤 ${value}%);
        this._label.set_text(`💤 ${value}%`);

    }

    destroy() {
        log('[WhoopExtension] destroy llamado');
        if (this._interval) GLib.source_remove(this._interval);
        this._button.destroy();
    }
}

export default class WhoopInfoExtension extends Extension {
    enable() {
        log('[WhoopInfoExtension] enable llamado');
        this._whoop = new WhoopExtension();
        Main.panel.addToStatusArea('whoop-sleep', this._whoop.actor);
    }

    disable() {
        log('[WhoopInfoExtension] disable llamado');
        if (this._whoop) {
            this._whoop.destroy();
            this._whoop = null;
        }
    }
}