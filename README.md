# 💤 GNOME Whoop Info Extension

**GNOME Whoop Info** is a lightweight GNOME Shell extension that connects to your [WHOOP](https://www.whoop.com/) account and displays your most important daily health metrics directly in the top bar of your GNOME desktop.

Whether you're monitoring your **recovery**, **sleep** and **strain**, this extension gives you a quick and unobtrusive glance at your status—without having to check your phone.

<div align="center">
  <img src="/img/image.png" alt="" width="500"/>
</div>

<div align="center">
  <img src="/img/image-2.png" alt="" width="500"/>
</div>

---

⚠️ **Important:**  
Before the extension can display your WHOOP data, you must authenticate your account and generate the required access tokens.

Please make sure to **carefully follow the Installation Guide** below to connect your WHOOP account successfully.

---

Once set up, the extension runs in the background and updates your data automatically throughout the day.

---

## 🛠️ Installation Guide

### 1. Install the Extension

1. Clone or download this repository:
   ```bash
   git clone https://github.com/juanmagdev/gnome-whoop-extension.git
   cd gnome-whoop-extension
   ```

2. Install the extension:
   ```bash
   make install
   ```

3. Restart GNOME Shell:
   ```bash
   make restart-shell
   ```

### 2. Create a Developer App on WHOOP

1. Visit the [WHOOP Developer Portal](https://developer.whoop.com/).
![Create App](/img/image-3.png)
2. Log in with your WHOOP account.
3. Click **"Create an App"** and fill out the form as follows:

   | Field             | Value                                      |
   |-------------------|--------------------------------------------|
   | **App Name**      | GNOME                                      |
   | **Contact Email** | your@email.com                             |
   | **Privacy Policy**| https://whoop.com                          |
   | **Redirect URI**  | `http://localhost:8000/callback`           |
   | **Scopes**        | Select **all** available scopes            |
   | **Webhook URL**   | (Leave empty)                              |

4. After creating the app, you'll receive your **Client ID** and **Client Secret**.

![App Created](/img/image-4.png)

### 3. Configure Authentication

1. Open GNOME Extensions app or go to Settings > Extensions
2. Find "Whoop Info" and click on the settings icon (⚙️)
3. In the preferences window:
   - Enter your **Client ID** and **Client Secret** from step 2
   - Click **"Start Authentication"**
   - A browser window will open with the WHOOP authorization page
   - Log in with your WHOOP account and authorize the application
   - Copy the callback URL from your browser's address bar
   - Paste it in the "Callback URL" field and click **"Process Callback"**
4. If successful, you'll see "Authentication successful!" and the extension will be ready to use

### 4. Alternative: Command Line Authentication

If you prefer using the command line, you can still use the original script:

1. Open a terminal and navigate to the extension folder:
   ```bash
   cd ~/.local/share/gnome-shell/extensions/whoop-info@juanmag.dev
   ```

2. Run the authentication script:
   ```bash
   ./whoopauth.sh
   ```

3. Follow the prompts to enter your credentials and complete the authorization process.

### 5. Verify Installation

After successful authentication, you should see your WHOOP metrics (recovery, sleep, and strain) displayed in the top bar of your GNOME desktop.