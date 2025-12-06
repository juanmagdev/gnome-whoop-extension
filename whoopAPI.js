// whoopAPI.js
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';

const ByteArray = imports.byteArray;

const API_BASE = 'https://api.prod.whoop.com';

function encodeFormData(data) {
    return Object.entries(data)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
}

export class WhoopAPI {
    constructor() {
        this._settings = new Gio.Settings({
            schema_id: 'org.gnome.shell.extensions.whoop-info'
        });
        this._session = new Soup.Session();
        this._loadTokens();
    }

    _loadTokens() {
        try {
            const isAuthenticated = this._settings.get_boolean('is-authenticated');
            if (!isAuthenticated) {
                throw new Error('No authenticated');
            }
            
            this._tokens = {
                client_id: this._settings.get_string('client-id'),
                client_secret: this._settings.get_string('client-secret'),
                access_token: this._settings.get_string('access-token'),
                refresh_token: this._settings.get_string('refresh-token')
            };
        } catch (e) {
            log('[WhoopAPI] Error leyendo tokens: ' + e.message);
            this._tokens = null;
        }
    }

    _saveTokens() {
        if (!this._tokens) return;
        
        this._settings.set_string('client-id', this._tokens.client_id);
        this._settings.set_string('client-secret', this._tokens.client_secret);
        this._settings.set_string('access-token', this._tokens.access_token);
        this._settings.set_string('refresh-token', this._tokens.refresh_token);
        this._settings.set_boolean('is-authenticated', true);
    }

    async refreshToken() {
        const url = `${API_BASE}/oauth/oauth2/token`;
        const body = encodeFormData({
            grant_type: 'refresh_token',
            refresh_token: this._tokens.refresh_token,
            client_id: this._tokens.client_id,
            client_secret: this._tokens.client_secret,
            scope: 'offline'
        });

        let msg = Soup.Message.new('POST', url);
        const encoder = new TextEncoder();
        msg.set_request_body_from_bytes('application/x-www-form-urlencoded', new GLib.Bytes(encoder.encode(body)));

        const res = await this._sendAsync(msg);
        this._tokens.access_token = res.access_token;
        this._tokens.refresh_token = res.refresh_token;
        this._saveTokens();
        return res;
    }

    async fetchEndpoint(path) {
        const url = `${API_BASE}/developer/v2/${path}`;
        let msg = Soup.Message.new('GET', url);
        msg.request_headers.append('Authorization', `Bearer ${this._tokens.access_token}`);
        return await this._sendAsync(msg);
    }

    _sendAsync(message) {
        return new Promise((resolve, reject) => {
            this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (sess, res) => {
                try {
                    let bytes = sess.send_and_read_finish(res);
                    let decoder = new TextDecoder('utf-8');
                    let text = decoder.decode(bytes.get_data());
                    resolve(JSON.parse(text));
                } catch (e) {
                    reject(e);
                }
            });
        });
    }
}
