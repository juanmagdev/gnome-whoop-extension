import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { WhoopAuth } from './whoopAuth.js';

export default class WhoopInfoPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings('org.gnome.shell.extensions.whoop-info');
        const whoopAuth = new WhoopAuth();

        // ===== Account Page =====
        const authPage = new Adw.PreferencesPage({
            title: 'Account',
            icon_name: 'avatar-default-symbolic',
        });
        window.add(authPage);

        this._buildAuthPage(authPage, settings, whoopAuth, window);
    }

    _buildAuthPage(page, settings, whoopAuth, window) {
        // ===== Credentials Group =====
        const credentialsGroup = new Adw.PreferencesGroup({
            title: 'API Credentials',
            description: 'Enter your WHOOP Developer API credentials',
        });
        page.add(credentialsGroup);

        const clientIdRow = new Adw.EntryRow({ title: 'Client ID' });
        clientIdRow.set_text(settings.get_string('client-id'));
        clientIdRow.connect('changed', () => {
            settings.set_string('client-id', clientIdRow.get_text());
        });
        credentialsGroup.add(clientIdRow);

        const clientSecretRow = new Adw.PasswordEntryRow({ title: 'Client Secret' });
        clientSecretRow.set_text(settings.get_string('client-secret'));
        clientSecretRow.connect('changed', () => {
            settings.set_string('client-secret', clientSecretRow.get_text());
        });
        credentialsGroup.add(clientSecretRow);

        // ===== Authentication Group =====
        const authGroup = new Adw.PreferencesGroup({
            title: 'Authentication',
            description: 'Connect your WHOOP account',
        });
        page.add(authGroup);

        const statusRow = new Adw.ActionRow({ title: 'Status' });
        const statusLabel = new Gtk.Label({
            label: settings.get_boolean('is-authenticated') ? '✓ Connected' : '✗ Not connected',
            css_classes: settings.get_boolean('is-authenticated') ? ['success'] : ['error'],
        });
        statusRow.add_suffix(statusLabel);
        authGroup.add(statusRow);

        const authButtonRow = new Adw.ActionRow({
            title: 'Step 1: Generate Auth URL',
            subtitle: 'Opens your browser to authorize the app',
        });
        const authButton = new Gtk.Button({
            label: 'Open Browser',
            valign: Gtk.Align.CENTER,
            css_classes: ['suggested-action'],
        });
        authButtonRow.add_suffix(authButton);
        authButtonRow.set_activatable_widget(authButton);
        authGroup.add(authButtonRow);

        // ===== Callback Group =====
        const callbackGroup = new Adw.PreferencesGroup({
            title: 'Step 2: Complete Authentication',
            description: 'After authorizing in browser, paste the callback URL here',
        });
        page.add(callbackGroup);

        const callbackRow = new Adw.EntryRow({ title: 'Callback URL' });
        callbackGroup.add(callbackRow);

        const processButtonRow = new Adw.ActionRow({
            title: 'Step 3: Get Tokens',
            subtitle: 'Exchange the authorization code for access tokens',
        });
        const processButton = new Gtk.Button({
            label: 'Complete Setup',
            valign: Gtk.Align.CENTER,
            sensitive: false,
            css_classes: ['suggested-action'],
        });
        processButtonRow.add_suffix(processButton);
        processButtonRow.set_activatable_widget(processButton);
        callbackGroup.add(processButtonRow);

        callbackRow.connect('changed', () => {
            processButton.set_sensitive(callbackRow.get_text().length > 0);
        });

        // ===== Instructions Group =====
        const instructionsGroup = new Adw.PreferencesGroup({ title: 'Instructions' });
        page.add(instructionsGroup);

        const instructionsRow = new Adw.ActionRow({
            title: 'How to get API credentials',
            subtitle: 'Visit developer.whoop.com to create an application',
        });
        const linkButton = new Gtk.Button({ label: 'Open Portal', valign: Gtk.Align.CENTER });
        linkButton.connect('clicked', () => {
            Gio.AppInfo.launch_default_for_uri('https://developer.whoop.com', null);
        });
        instructionsRow.add_suffix(linkButton);
        instructionsGroup.add(instructionsRow);

        // ===== Event Handlers =====
        let tempClientId = null;
        let tempClientSecret = null;

        authButton.connect('clicked', () => {
            const clientId = clientIdRow.get_text().trim();
            const clientSecret = clientSecretRow.get_text().trim();

            if (!clientId || !clientSecret) {
                this._showToast(window, 'Please enter Client ID and Client Secret first');
                return;
            }

            try {
                const authUrl = whoopAuth.buildAuthUrl(clientId);
                tempClientId = clientId;
                tempClientSecret = clientSecret;
                Gio.AppInfo.launch_default_for_uri(authUrl, null);
                
                authButton.set_label('URL Opened ✓');
                authButton.set_sensitive(false);
                
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
                    authButton.set_label('Open Browser');
                    authButton.set_sensitive(true);
                    return GLib.SOURCE_REMOVE;
                });
            } catch (error) {
                this._showToast(window, `Error: ${error.message}`);
            }
        });

        processButton.connect('clicked', () => {
            const callbackUrl = callbackRow.get_text().trim();

            if (!callbackUrl) {
                this._showToast(window, 'Please paste the callback URL');
                return;
            }

            if (!tempClientId || !tempClientSecret) {
                tempClientId = clientIdRow.get_text().trim();
                tempClientSecret = clientSecretRow.get_text().trim();
                
                if (!tempClientId || !tempClientSecret) {
                    this._showToast(window, 'Please click "Open Browser" first to start authentication');
                    return;
                }
            }

            processButton.set_label('Processing...');
            processButton.set_sensitive(false);

            try {
                const code = whoopAuth.extractCodeFromCallback(callbackUrl);
                
                whoopAuth.exchangeCodeForTokens(tempClientId, tempClientSecret, code)
                    .then(tokens => {
                        settings.set_string('client-id', tokens.client_id);
                        settings.set_string('client-secret', tokens.client_secret);
                        settings.set_string('access-token', tokens.access_token);
                        settings.set_string('refresh-token', tokens.refresh_token);
                        settings.set_boolean('is-authenticated', true);

                        statusLabel.set_label('✓ Connected');
                        statusLabel.set_css_classes(['success']);
                        callbackRow.set_text('');
                        processButton.set_label('Complete Setup');
                        processButton.set_sensitive(false);

                        this._showToast(window, 'Authentication successful! Extension is ready.');
                    })
                    .catch(error => {
                        processButton.set_label('Complete Setup');
                        processButton.set_sensitive(true);
                        this._showToast(window, `Error: ${error.message}`);
                    });
            } catch (error) {
                processButton.set_label('Complete Setup');
                processButton.set_sensitive(true);
                this._showToast(window, `Error: ${error.message}`);
            }
        });

        // ===== Logout Group =====
        if (settings.get_boolean('is-authenticated')) {
            const dangerGroup = new Adw.PreferencesGroup({ title: 'Account' });
            page.add(dangerGroup);

            const logoutRow = new Adw.ActionRow({
                title: 'Disconnect Account',
                subtitle: 'Remove stored tokens and disconnect from WHOOP',
            });
            const logoutButton = new Gtk.Button({
                label: 'Disconnect',
                valign: Gtk.Align.CENTER,
                css_classes: ['destructive-action'],
            });
            
            logoutButton.connect('clicked', () => {
                settings.set_string('access-token', '');
                settings.set_string('refresh-token', '');
                settings.set_boolean('is-authenticated', false);
                
                statusLabel.set_label('✗ Not connected');
                statusLabel.set_css_classes(['error']);
                
                this._showToast(window, 'Disconnected from WHOOP');
            });
            
            logoutRow.add_suffix(logoutButton);
            dangerGroup.add(logoutRow);
        }
    }

    _showToast(window, message) {
        const toast = new Adw.Toast({ title: message, timeout: 3 });
        window.add_toast(toast);
    }
}
