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

        // ===== Display Page =====
        const displayPage = new Adw.PreferencesPage({
            title: 'Display',
            icon_name: 'preferences-desktop-display-symbolic',
        });
        window.add(displayPage);
        this._buildDisplayPage(displayPage, settings);
    }

    _buildDisplayPage(page, settings) {
        // ===== Panel Metrics =====
        const metricsGroup = new Adw.PreferencesGroup({
            title: 'Panel Metrics',
            description: 'Choose which metrics appear in the top bar',
        });
        page.add(metricsGroup);

        const metrics = [
            { key: 'show-recovery', title: 'Recovery Score', subtitle: 'Show recovery % with color indicator' },
            { key: 'show-sleep',    title: 'Sleep Performance', subtitle: 'Show sleep performance %' },
            { key: 'show-strain',   title: 'Daily Strain', subtitle: 'Show day strain score' },
        ];

        for (const { key, title, subtitle } of metrics) {
            const row = new Adw.SwitchRow({ title, subtitle });
            row.set_active(settings.get_boolean(key));
            row.connect('notify::active', () => {
                settings.set_boolean(key, row.get_active());
            });
            metricsGroup.add(row);
        }

        // ===== Panel Format =====
        const formatGroup = new Adw.PreferencesGroup({
            title: 'Panel Format',
            description: 'Customize how metrics appear in the top bar',
        });
        page.add(formatGroup);

        const iconsRow = new Adw.SwitchRow({
            title: 'Show Icons',
            subtitle: 'Display metric icons alongside values',
        });
        iconsRow.set_active(settings.get_boolean('panel-show-icons'));
        iconsRow.connect('notify::active', () => {
            settings.set_boolean('panel-show-icons', iconsRow.get_active());
        });
        formatGroup.add(iconsRow);

        const unitRow = new Adw.SwitchRow({
            title: 'Show Unit (%)',
            subtitle: 'Display the % symbol next to values',
        });
        unitRow.set_active(settings.get_boolean('panel-show-unit'));
        unitRow.connect('notify::active', () => {
            settings.set_boolean('panel-show-unit', unitRow.get_active());
        });
        formatGroup.add(unitRow);

        // ===== Update Interval =====
        const updateGroup = new Adw.PreferencesGroup({
            title: 'Update Interval',
            description: 'How often to fetch new data from WHOOP',
        });
        page.add(updateGroup);

        const intervalRow = new Adw.ComboRow({ title: 'Refresh every' });
        const intervals = [5, 15, 30, 60];
        const labels = ['5 minutes', '15 minutes', '30 minutes', '1 hour'];
        const model = new Gtk.StringList();
        labels.forEach(l => model.append(l));
        intervalRow.set_model(model);

        const currentInterval = settings.get_int('update-interval');
        const currentIndex = intervals.indexOf(currentInterval);
        intervalRow.set_selected(currentIndex >= 0 ? currentIndex : 1);

        intervalRow.connect('notify::selected', () => {
            settings.set_int('update-interval', intervals[intervalRow.get_selected()]);
        });
        updateGroup.add(intervalRow);

        // ===== Units =====
        const unitsGroup = new Adw.PreferencesGroup({
            title: 'Units',
            description: 'Measurement unit preferences',
        });
        page.add(unitsGroup);

        const tempRow = new Adw.ComboRow({ title: 'Temperature' });
        const tempModel = new Gtk.StringList();
        ['Celsius (°C)', 'Fahrenheit (°F)'].forEach(l => tempModel.append(l));
        tempRow.set_model(tempModel);
        tempRow.set_selected(settings.get_string('temp-unit') === 'fahrenheit' ? 1 : 0);
        tempRow.connect('notify::selected', () => {
            settings.set_string('temp-unit', tempRow.get_selected() === 1 ? 'fahrenheit' : 'celsius');
        });
        unitsGroup.add(tempRow);

        // ===== Notifications =====
        const notifyGroup = new Adw.PreferencesGroup({
            title: 'Notifications',
            description: 'Get alerted when your recovery is low',
        });
        page.add(notifyGroup);

        const notifyRow = new Adw.SwitchRow({
            title: 'Low Recovery Alert',
            subtitle: 'Notify when recovery score falls below the threshold',
        });
        notifyRow.set_active(settings.get_boolean('notify-low-recovery'));
        notifyRow.connect('notify::active', () => {
            const active = notifyRow.get_active();
            settings.set_boolean('notify-low-recovery', active);
            thresholdRow.set_sensitive(active);
        });
        notifyGroup.add(notifyRow);

        const thresholdRow = new Adw.SpinRow({
            title: 'Threshold',
            subtitle: 'Alert when recovery falls below this %',
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 100,
                step_increment: 1,
                value: settings.get_int('notify-recovery-threshold'),
            }),
            sensitive: settings.get_boolean('notify-low-recovery'),
        });
        thresholdRow.connect('notify::value', () => {
            settings.set_int('notify-recovery-threshold', thresholdRow.get_value());
        });
        notifyGroup.add(thresholdRow);
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

        const isAuth = settings.get_boolean('is-authenticated');
        const statusRow = new Adw.ActionRow({ title: 'Status' });
        const statusLabel = new Gtk.Label({
            label: isAuth ? '✓ Connected' : '✗ Not connected',
            css_classes: isAuth ? ['success'] : ['error'],
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

        // ===== Account (Disconnect) Group =====
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
            sensitive: settings.get_boolean('is-authenticated'),
        });
        logoutRow.add_suffix(logoutButton);
        dangerGroup.add(logoutRow);

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

        logoutButton.connect('clicked', () => {
            settings.set_string('access-token', '');
            settings.set_string('refresh-token', '');
            settings.set_boolean('is-authenticated', false);
            this._showToast(window, 'Disconnected from WHOOP');
        });

        // React to auth state changes (fixes post-login/logout stale UI)
        settings.connect('changed::is-authenticated', () => {
            const authenticated = settings.get_boolean('is-authenticated');
            statusLabel.set_label(authenticated ? '✓ Connected' : '✗ Not connected');
            statusLabel.set_css_classes(authenticated ? ['success'] : ['error']);
            logoutButton.set_sensitive(authenticated);
        });
    }

    _showToast(window, message) {
        const toast = new Adw.Toast({ title: message, timeout: 3 });
        window.add_toast(toast);
    }
}
