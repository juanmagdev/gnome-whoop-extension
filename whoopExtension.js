import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { WhoopAPI } from './whoopAPI.js';

export class WhoopExtension {
    constructor() {
        this._api = new WhoopAPI();
        this._button = new PanelMenu.Button(0.0, 'WhoopPanel', false);
        this._lastUpdate = null;
        
        // Store full data for menu
        this._recoveryData = null;
        this._sleepData = null;
        this._strainData = null;

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

        // Build dropdown menu
        this._buildMenu();

        // Initial update
        this._updateLoop();

        // Update data every 15 minutes
        this._dataInterval = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 900, () => {
            this._updateLoop();
            return GLib.SOURCE_CONTINUE;
        });

        // Listen for system resume from suspend
        this._setupSuspendHandler();
    }

    _buildMenu() {
        // ===== Recovery Section =====
        this._menuRecoveryHeader = new PopupMenu.PopupMenuItem(' Recovery', { reactive: false });
        this._menuRecoveryHeader.label.add_style_class_name('popup-menu-header');
        this._button.menu.addMenuItem(this._menuRecoveryHeader);

        this._menuRecoveryScore = new PopupMenu.PopupMenuItem('  Score: --', { reactive: false });
        this._button.menu.addMenuItem(this._menuRecoveryScore);

        this._menuRecoveryHRV = new PopupMenu.PopupMenuItem('  HRV: --', { reactive: false });
        this._button.menu.addMenuItem(this._menuRecoveryHRV);

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

        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // ===== Actions =====
        const refreshItem = new PopupMenu.PopupMenuItem(' Refresh Now');
        refreshItem.connect('activate', () => {
            this._updateLoop();
        });
        this._button.menu.addMenuItem(refreshItem);

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
            const temp = score?.skin_temp_celsius ? score.skin_temp_celsius.toFixed(1) : '--';

            this._menuRecoveryScore.label.set_text(`  Score: ${recoveryScore}%`);
            this._menuRecoveryHRV.label.set_text(`  HRV: ${hrv} ms`);
            this._menuRecoveryRHR.label.set_text(`  Resting HR: ${rhr} bpm`);
            this._menuRecoverySpo2.label.set_text(`  SpO2: ${spo2}%`);
            this._menuRecoveryTemp.label.set_text(`  Skin Temp: ${temp}°C`);
        }

        // Update Sleep section
        if (this._sleepData) {
            const score = this._sleepData.score;
            const perf = score?.sleep_performance_percentage ?? '--';
            const efficiency = score?.sleep_efficiency_percentage ? score.sleep_efficiency_percentage.toFixed(0) : '--';
            const consistency = score?.sleep_consistency_percentage ?? '--';
            const respRate = score?.respiratory_rate ? score.respiratory_rate.toFixed(1) : '--';
            
            // Calculate duration from stage_summary
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
            const calories = Math.round(kilojoules * 0.239); // Convert kJ to kcal
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
        try {
            await this._api.refreshToken();
            const recovery = await this._api.fetchEndpoint('recovery');
            const sleep = await this._api.fetchEndpoint('activity/sleep');
            const strain = await this._api.fetchEndpoint('cycle');

            // Store full data for menu
            this._recoveryData = recovery?.records?.[0] ?? null;
            this._sleepData = sleep?.records?.[0] ?? null;
            this._strainData = strain?.records?.[0] ?? null;
            this._lastUpdate = new Date();

            // Update panel labels
            const recoveryScore = this._recoveryData?.score?.recovery_score ?? '-';
            const sleepPerf = this._sleepData?.score?.sleep_performance_percentage ?? '-';
            const strainRaw = this._strainData?.score?.strain;
            
            const strainText = (typeof strainRaw === 'number') 
                ? `${(Math.round(strainRaw * 100) / 100).toFixed(1)}`
                : '-';

            this._labelSleep.set_text(`${sleepPerf}%`);
            this._labelRecovery.set_text(`${recoveryScore}%`);
            this._labelStrain.set_text(strainText);

            // Update dropdown menu
            this._updateMenu();
        } catch (e) {
            log(`[WhoopExtension] Error updating: ${e.message}`);
            this._labelSleep.set_text('-');
            this._labelRecovery.set_text('-');
            this._labelStrain.set_text('-');
        }
    }

    get actor() {
        return this._button;
    }

    destroy() {
        if (this._dataInterval) {
            GLib.source_remove(this._dataInterval);
            this._dataInterval = null;
        }

        if (this._prepareForSleepId && this._loginManagerProxy) {
            this._loginManagerProxy.disconnect(this._prepareForSleepId);
            this._prepareForSleepId = null;
            this._loginManagerProxy = null;
        }

        this._button.destroy();
    }
}
