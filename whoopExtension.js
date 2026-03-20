import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { WhoopAPI } from './whoopAPI.js';

export class WhoopExtension {
    constructor(settings) {
        this._api = new WhoopAPI();
        this._settings = settings;
        this._button = new PanelMenu.Button(0.0, 'WhoopPanel', false);
        this._lastUpdate = null;
        this._nextUpdateTime = null;
        this._isRefreshing = false;
        this._lastNotifyDate = null;

        // Store full data for menu
        this._recoveryData = null;
        this._sleepData = null;
        this._strainData = null;
        this._weeklyRecoveryData = null;

        const extensionDir = GLib.build_filenamev([
            GLib.get_home_dir(),
            '.local/share/gnome-shell/extensions/whoop-info@juanmag.dev'
        ]);
        this._extensionDir = extensionDir;

        // Create panel layout
        this._layout = new St.BoxLayout({ vertical: false, style_class: 'panel-status-menu-box' });

        this._iconSleep = this._createIcon(`${extensionDir}/img/sleep.svg`);
        this._iconRecovery = this._createIcon(`${extensionDir}/img/recovery.svg`);
        this._iconStrain = this._createIcon(`${extensionDir}/img/strain.svg`);

        this._labelSleep = new St.Label({ text: '...', y_align: Clutter.ActorAlign.CENTER });
        this._labelRecovery = new St.Label({ text: '...', y_align: Clutter.ActorAlign.CENTER });
        this._labelStrain = new St.Label({ text: '...', y_align: Clutter.ActorAlign.CENTER });

        this._layout.add_child(this._iconSleep);
        this._layout.add_child(this._labelSleep);
        this._layout.add_child(this._iconRecovery);
        this._layout.add_child(this._labelRecovery);
        this._layout.add_child(this._iconStrain);
        this._layout.add_child(this._labelStrain);

        this._button.add_child(this._layout);

        // React to display setting changes
        this._settingsChangedId = this._settings.connect('changed', (_s, key) => {
            if (['show-recovery', 'show-sleep', 'show-strain', 'panel-show-icons'].includes(key))
                this._updatePanelVisibility();
            if (key === 'panel-show-unit')
                this._refreshPanelFromCache();
            if (key === 'temp-unit')
                this._updateMenu();
            if (key === 'update-interval')
                this._resetUpdateInterval();
        });
        this._updatePanelVisibility();

        // Build dropdown menu
        this._buildMenu();

        // Initial update
        this._updateLoop();

        // Update data on configured interval
        this._startUpdateInterval();

        // Countdown timer (updates every minute)
        this._startCountdownTimer();

        // Listen for system resume from suspend
        this._setupSuspendHandler();
    }

    _updatePanelVisibility() {
        const showRecovery = this._settings.get_boolean('show-recovery');
        const showSleep = this._settings.get_boolean('show-sleep');
        const showStrain = this._settings.get_boolean('show-strain');
        const showIcons = this._settings.get_boolean('panel-show-icons');

        this._iconRecovery.visible = showRecovery && showIcons;
        this._labelRecovery.visible = showRecovery;
        this._iconSleep.visible = showSleep && showIcons;
        this._labelSleep.visible = showSleep;
        this._iconStrain.visible = showStrain && showIcons;
        this._labelStrain.visible = showStrain;
    }

    _getRecoveryColor(score) {
        if (score >= 67) return '#4ade80'; // green
        if (score >= 34) return '#fbbf24'; // yellow
        return '#f87171';                  // red
    }

    _getSleepColor(score) {
        if (score >= 85) return '#4ade80'; // green
        if (score >= 70) return '#fbbf24'; // yellow
        return '#f87171';                  // red
    }

    _getStrainColor(strain) {
        if (strain >= 18) return '#f87171'; // red — high strain
        if (strain >= 10) return '#fbbf24'; // yellow — moderate
        return '#4ade80';                   // green — low/optimal
    }

    _formatTemp(celsius) {
        if (celsius == null) return '--';
        if (this._settings.get_string('temp-unit') === 'fahrenheit')
            return `${(celsius * 9 / 5 + 32).toFixed(1)}°F`;
        return `${celsius.toFixed(1)}°C`;
    }

    _startUpdateInterval() {
        const minutes = this._settings.get_int('update-interval');
        this._dataInterval = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, minutes * 60, () => {
            this._updateLoop();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _resetUpdateInterval() {
        if (this._dataInterval) {
            GLib.source_remove(this._dataInterval);
            this._dataInterval = null;
        }
        this._startUpdateInterval();
        const minutes = this._settings.get_int('update-interval');
        this._nextUpdateTime = new Date(Date.now() + minutes * 60 * 1000);
        this._updateCountdown();
    }

    _startCountdownTimer() {
        this._countdownInterval = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
            this._updateCountdown();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _updateCountdown() {
        if (!this._menuNextUpdate || !this._nextUpdateTime) return;
        const diffMs = this._nextUpdateTime - Date.now();
        if (diffMs <= 0) {
            this._menuNextUpdate.label.set_text('Next update: soon');
        } else {
            const mins = Math.ceil(diffMs / 60000);
            this._menuNextUpdate.label.set_text(`Next update in: ${mins} min`);
        }
    }

    _setRefreshing(isRefreshing) {
        this._isRefreshing = isRefreshing;
        if (this._refreshItem) {
            this._refreshItem.label.set_text(isRefreshing ? ' Refreshing...' : ' Refresh Now');
            this._refreshItem.reactive = !isRefreshing;
        }
    }

    _checkAndNotify(recoveryScore) {
        if (!this._settings.get_boolean('notify-low-recovery')) return;
        const threshold = this._settings.get_int('notify-recovery-threshold');
        if (recoveryScore < threshold) {
            const today = new Date().toDateString();
            if (this._lastNotifyDate !== today) {
                this._lastNotifyDate = today;
                Main.notify(
                    'WHOOP — Low Recovery',
                    `Your recovery is ${recoveryScore}% (threshold: ${threshold}%)`
                );
            }
        }
    }

    _refreshPanelFromCache() {
        const showUnit = this._settings.get_boolean('panel-show-unit');
        const u = showUnit ? '%' : '';

        const recoveryScore = this._recoveryData?.score?.recovery_score ?? null;
        const sleepPerf = this._sleepData?.score?.sleep_performance_percentage ?? null;
        const strainRaw = this._strainData?.score?.strain ?? null;

        this._labelRecovery.set_text(recoveryScore !== null ? `${recoveryScore}${u}` : '-');
        this._labelSleep.set_text(sleepPerf !== null ? `${sleepPerf}${u}` : '-');
        const strainText = typeof strainRaw === 'number'
            ? `${(Math.round(strainRaw * 100) / 100).toFixed(1)}`
            : '-';
        this._labelStrain.set_text(strainText);
    }

    _buildMenu() {
        // ===== Recovery Section =====
        this._menuRecoveryHeader = new PopupMenu.PopupMenuItem(' Recovery', { reactive: false });
        this._menuRecoveryHeader.label.add_style_class_name('popup-menu-header');
        this._button.menu.addMenuItem(this._menuRecoveryHeader);

        this._menuRecoveryScore = new PopupMenu.PopupMenuItem('  Score: --', { reactive: false });
        this._button.menu.addMenuItem(this._menuRecoveryScore);

        this._menuWeeklyRecovery = new PopupMenu.PopupMenuItem('  7-day avg: --', { reactive: false });
        this._menuWeeklyRecovery.label.add_style_class_name('popup-inactive-menu-item');
        this._button.menu.addMenuItem(this._menuWeeklyRecovery);

        this._menuRecoveryHRV = new PopupMenu.PopupMenuItem('  HRV: --', { reactive: false });
        this._button.menu.addMenuItem(this._menuRecoveryHRV);

        this._menuWeeklyHRV = new PopupMenu.PopupMenuItem('  7-day avg HRV: --', { reactive: false });
        this._menuWeeklyHRV.label.add_style_class_name('popup-inactive-menu-item');
        this._button.menu.addMenuItem(this._menuWeeklyHRV);

        this._menuRecoveryRHR = new PopupMenu.PopupMenuItem('  Resting HR: --', { reactive: false });
        this._button.menu.addMenuItem(this._menuRecoveryRHR);

        this._menuRecoverySpo2 = new PopupMenu.PopupMenuItem('  SpO2: --', { reactive: false });
        this._button.menu.addMenuItem(this._menuRecoverySpo2);

        this._menuRecoveryTemp = new PopupMenu.PopupMenuItem('  Skin Temp: --', { reactive: false });
        this._button.menu.addMenuItem(this._menuRecoveryTemp);

        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // ===== Sleep Section =====
        this._menuSleepHeader = new PopupMenu.PopupMenuItem(' Sleep', { reactive: false });
        this._menuSleepHeader.label.add_style_class_name('popup-menu-header');
        this._button.menu.addMenuItem(this._menuSleepHeader);

        this._menuSleepPerformance = new PopupMenu.PopupMenuItem('  Performance: --', { reactive: false });
        this._button.menu.addMenuItem(this._menuSleepPerformance);

        this._menuSleepDuration = new PopupMenu.PopupMenuItem('  Duration: --', { reactive: false });
        this._button.menu.addMenuItem(this._menuSleepDuration);

        this._menuSleepEfficiency = new PopupMenu.PopupMenuItem('  Efficiency: --', { reactive: false });
        this._button.menu.addMenuItem(this._menuSleepEfficiency);

        this._menuSleepConsistency = new PopupMenu.PopupMenuItem('  Consistency: --', { reactive: false });
        this._button.menu.addMenuItem(this._menuSleepConsistency);

        this._menuSleepRespRate = new PopupMenu.PopupMenuItem('  Resp. Rate: --', { reactive: false });
        this._button.menu.addMenuItem(this._menuSleepRespRate);

        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // ===== Strain Section =====
        this._menuStrainHeader = new PopupMenu.PopupMenuItem(' Strain', { reactive: false });
        this._menuStrainHeader.label.add_style_class_name('popup-menu-header');
        this._button.menu.addMenuItem(this._menuStrainHeader);

        this._menuStrainScore = new PopupMenu.PopupMenuItem('  Day Strain: --', { reactive: false });
        this._button.menu.addMenuItem(this._menuStrainScore);

        this._menuStrainCalories = new PopupMenu.PopupMenuItem('  Calories: --', { reactive: false });
        this._button.menu.addMenuItem(this._menuStrainCalories);

        this._menuStrainAvgHR = new PopupMenu.PopupMenuItem('  Avg HR: --', { reactive: false });
        this._button.menu.addMenuItem(this._menuStrainAvgHR);

        this._menuStrainMaxHR = new PopupMenu.PopupMenuItem('  Max HR: --', { reactive: false });
        this._button.menu.addMenuItem(this._menuStrainMaxHR);

        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // ===== Status Section =====
        this._menuLastUpdate = new PopupMenu.PopupMenuItem('Last update: --', { reactive: false });
        this._menuLastUpdate.label.add_style_class_name('popup-inactive-menu-item');
        this._button.menu.addMenuItem(this._menuLastUpdate);

        this._menuNextUpdate = new PopupMenu.PopupMenuItem('Next update in: --', { reactive: false });
        this._menuNextUpdate.label.add_style_class_name('popup-inactive-menu-item');
        this._button.menu.addMenuItem(this._menuNextUpdate);

        this._menuError = new PopupMenu.PopupMenuItem('', { reactive: false });
        this._menuError.label.set_style('color: #f87171;');
        this._menuError.visible = false;
        this._button.menu.addMenuItem(this._menuError);

        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // ===== Actions =====
        this._refreshItem = new PopupMenu.PopupMenuItem(' Refresh Now');
        this._refreshItem.connect('activate', () => {
            this._updateLoop();
        });
        this._button.menu.addMenuItem(this._refreshItem);

        const settingsItem = new PopupMenu.PopupMenuItem(' Settings');
        settingsItem.connect('activate', () => {
            try {
                const subprocess = new Gio.Subprocess({
                    argv: ['gnome-extensions', 'prefs', 'whoop-info@juanmag.dev'],
                    flags: Gio.SubprocessFlags.NONE,
                });
                subprocess.init(null);
            } catch (e) {
                log(`[WhoopExtension] Failed to open settings: ${e.message}`);
            }
        });
        this._button.menu.addMenuItem(settingsItem);
    }

    _updateMenu() {
        // Update Recovery section
        if (this._recoveryData) {
            const score = this._recoveryData.score;
            const recoveryScore = score?.recovery_score ?? '--';
            const hrv = score?.hrv_rmssd_milli ? score.hrv_rmssd_milli.toFixed(1) : '--';
            const rhr = score?.resting_heart_rate ?? '--';
            const spo2 = score?.spo2_percentage ? score.spo2_percentage.toFixed(1) : '--';
            const temp = this._formatTemp(score?.skin_temp_celsius ?? null);

            this._menuRecoveryScore.label.set_text(`  Score: ${recoveryScore}%`);
            this._menuRecoveryHRV.label.set_text(`  HRV: ${hrv} ms`);
            this._menuRecoveryRHR.label.set_text(`  Resting HR: ${rhr} bpm`);
            this._menuRecoverySpo2.label.set_text(`  SpO2: ${spo2}%`);
            this._menuRecoveryTemp.label.set_text(`  Skin Temp: ${temp}`);
        }

        // Update weekly recovery averages
        if (this._weeklyRecoveryData && this._weeklyRecoveryData.length > 0) {
            const validRecovery = this._weeklyRecoveryData
                .filter(r => r.score?.recovery_score != null)
                .map(r => r.score.recovery_score);
            const avgRecovery = validRecovery.length > 0
                ? Math.round(validRecovery.reduce((a, b) => a + b, 0) / validRecovery.length)
                : null;

            const validHRV = this._weeklyRecoveryData
                .filter(r => r.score?.hrv_rmssd_milli != null)
                .map(r => r.score.hrv_rmssd_milli);
            const avgHRV = validHRV.length > 0
                ? (validHRV.reduce((a, b) => a + b, 0) / validHRV.length).toFixed(1)
                : null;

            const n = this._weeklyRecoveryData.length;
            this._menuWeeklyRecovery.label.set_text(
                `  ${n}-day avg: ${avgRecovery !== null ? avgRecovery + '%' : '--'}`
            );
            this._menuWeeklyHRV.label.set_text(
                `  ${n}-day avg HRV: ${avgHRV !== null ? avgHRV + ' ms' : '--'}`
            );
        }

        // Update Sleep section
        if (this._sleepData) {
            const score = this._sleepData.score;
            const perf = score?.sleep_performance_percentage ?? '--';
            const efficiency = score?.sleep_efficiency_percentage ? score.sleep_efficiency_percentage.toFixed(0) : '--';
            const consistency = score?.sleep_consistency_percentage ?? '--';
            const respRate = score?.respiratory_rate ? score.respiratory_rate.toFixed(1) : '--';

            const stages = score?.stage_summary;
            let duration = '--';
            if (stages) {
                const totalMs = stages.total_in_bed_time_milli - stages.total_awake_time_milli;
                const hours = Math.floor(totalMs / 3600000);
                const minutes = Math.floor((totalMs % 3600000) / 60000);
                duration = `${hours}h ${minutes}m`;
            }

            this._menuSleepPerformance.label.set_text(`  Performance: ${perf}%`);
            this._menuSleepDuration.label.set_text(`  Duration: ${duration}`);
            this._menuSleepEfficiency.label.set_text(`  Efficiency: ${efficiency}%`);
            this._menuSleepConsistency.label.set_text(`  Consistency: ${consistency}%`);
            this._menuSleepRespRate.label.set_text(`  Resp. Rate: ${respRate} br/min`);
        }

        // Update Strain section
        if (this._strainData) {
            const score = this._strainData.score;
            const strain = score?.strain ? score.strain.toFixed(1) : '--';
            const kilojoules = score?.kilojoule ?? 0;
            const calories = Math.round(kilojoules * 0.239);
            const avgHR = score?.average_heart_rate ?? '--';
            const maxHR = score?.max_heart_rate ?? '--';

            this._menuStrainScore.label.set_text(`  Day Strain: ${strain}`);
            this._menuStrainCalories.label.set_text(`  Calories: ${calories} kcal`);
            this._menuStrainAvgHR.label.set_text(`  Avg HR: ${avgHR} bpm`);
            this._menuStrainMaxHR.label.set_text(`  Max HR: ${maxHR} bpm`);
        }

        // Update last update time
        if (this._lastUpdate) {
            const timeStr = this._lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            this._menuLastUpdate.label.set_text(`Last update: ${timeStr}`);
        }
    }

    _setupSuspendHandler() {
        try {
            this._loginManagerProxy = Gio.DBusProxy.new_for_bus_sync(
                Gio.BusType.SYSTEM,
                Gio.DBusProxyFlags.NONE,
                null,
                'org.freedesktop.login1',
                '/org/freedesktop/login1',
                'org.freedesktop.login1.Manager',
                null
            );

            this._prepareForSleepId = this._loginManagerProxy.connect(
                'g-signal',
                (proxy, senderName, signalName, parameters) => {
                    if (signalName === 'PrepareForSleep') {
                        const [aboutToSleep] = parameters.deep_unpack();
                        if (!aboutToSleep) {
                            log('[WhoopExtension] System resumed from suspend, refreshing data...');
                            GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
                                this._updateLoop();
                                return GLib.SOURCE_REMOVE;
                            });
                        }
                    }
                }
            );
        } catch (e) {
            log(`[WhoopExtension] Failed to setup suspend handler: ${e.message}`);
        }
    }

    _createIcon(path) {
        return new St.Icon({
            gicon: Gio.icon_new_for_string(path),
            style_class: 'system-status-icon',
            icon_size: 18
        });
    }

    async _updateLoop() {
        if (this._isRefreshing) return;
        this._setRefreshing(true);

        try {
            await this._api.refreshToken();
            const [recovery, sleep, strain, weeklyRecovery] = await Promise.all([
                this._api.fetchEndpoint('recovery'),
                this._api.fetchEndpoint('activity/sleep'),
                this._api.fetchEndpoint('cycle'),
                this._api.fetchCollection('recovery', 7),
            ]);

            this._recoveryData = recovery?.records?.[0] ?? null;
            this._sleepData = sleep?.records?.[0] ?? null;
            this._strainData = strain?.records?.[0] ?? null;
            this._weeklyRecoveryData = weeklyRecovery?.records ?? null;
            this._lastUpdate = new Date();

            // Set next update time
            const minutes = this._settings.get_int('update-interval');
            this._nextUpdateTime = new Date(Date.now() + minutes * 60 * 1000);

            // Update panel labels
            const showUnit = this._settings.get_boolean('panel-show-unit');
            const u = showUnit ? '%' : '';

            const recoveryScore = this._recoveryData?.score?.recovery_score ?? null;
            const sleepPerf = this._sleepData?.score?.sleep_performance_percentage ?? null;
            const strainRaw = this._strainData?.score?.strain ?? null;

            const strainText = typeof strainRaw === 'number'
                ? `${(Math.round(strainRaw * 100) / 100).toFixed(1)}`
                : '-';

            this._labelSleep.set_text(sleepPerf !== null ? `${sleepPerf}${u}` : '-');
            this._labelRecovery.set_text(recoveryScore !== null ? `${recoveryScore}${u}` : '-');
            this._labelStrain.set_text(strainText);

            // Color-code recovery score
            if (recoveryScore !== null) {
                const color = this._getRecoveryColor(recoveryScore);
                this._labelRecovery.set_style(`color: ${color};`);
                this._iconRecovery.set_style(`color: ${color};`);
            } else {
                this._labelRecovery.set_style(null);
                this._iconRecovery.set_style(null);
            }

            // Color-code sleep performance
            if (sleepPerf !== null) {
                const color = this._getSleepColor(sleepPerf);
                this._labelSleep.set_style(`color: ${color};`);
                this._iconSleep.set_style(`color: ${color};`);
            } else {
                this._labelSleep.set_style(null);
                this._iconSleep.set_style(null);
            }

            // Color-code strain
            if (strainRaw !== null) {
                const color = this._getStrainColor(strainRaw);
                this._labelStrain.set_style(`color: ${color};`);
                this._iconStrain.set_style(`color: ${color};`);
            } else {
                this._labelStrain.set_style(null);
                this._iconStrain.set_style(null);
            }

            // Check low recovery notification
            if (recoveryScore !== null)
                this._checkAndNotify(recoveryScore);

            // Clear error state
            this._layout.remove_style_class_name('whoop-error');
            this._menuError.visible = false;

            // Update dropdown menu and countdown
            this._updateMenu();
            this._updateCountdown();
        } catch (e) {
            log(`[WhoopExtension] Error updating: ${e.message}`);
            this._labelSleep.set_text('!');
            this._labelRecovery.set_text('!');
            this._labelStrain.set_text('!');
            this._labelSleep.set_style('color: #f87171;');
            this._labelRecovery.set_style('color: #f87171;');
            this._labelStrain.set_style('color: #f87171;');
            this._iconRecovery.set_style('color: #f87171;');
            this._iconSleep.set_style('color: #f87171;');
            this._iconStrain.set_style('color: #f87171;');
            this._menuLastUpdate.label.set_text('Last update: failed');
            this._menuError.label.set_text(`Error: ${e.message}`);
            this._menuError.visible = true;
        } finally {
            this._setRefreshing(false);
        }
    }

    get actor() {
        return this._button;
    }

    destroy() {
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        if (this._dataInterval) {
            GLib.source_remove(this._dataInterval);
            this._dataInterval = null;
        }

        if (this._countdownInterval) {
            GLib.source_remove(this._countdownInterval);
            this._countdownInterval = null;
        }

        if (this._prepareForSleepId && this._loginManagerProxy) {
            this._loginManagerProxy.disconnect(this._prepareForSleepId);
            this._prepareForSleepId = null;
            this._loginManagerProxy = null;
        }

        this._button.destroy();
    }
}
